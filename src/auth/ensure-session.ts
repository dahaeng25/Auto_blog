import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { createBrowserSession, getSessionPage } from "./browser-factory.js";
import {
  autoLoginNaver,
  autoLoginTistory,
  type PlatformCredentials,
} from "./auto-login.js";
import {
  hasEnvCredentials,
  resolveCredentials,
} from "./platform-credentials.js";
import { hasLoginCookies, sessionExpiredMessage } from "./login-check.js";
import {
  hasSession,
  requireSession,
  saveSession,
} from "./session-manager.js";
import { notifyError } from "../monitoring/discord-notifier.js";
import { humanPause } from "../publishing/utils/human-input.js";
import {
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
} from "./write-page-nav.js";

export type EnsureSessionOptions = {
  /** 저장된 세션을 무시하고 다시 로그인 */
  forceRelogin?: boolean;
  /** 일회성 자격증명 (요청에만 사용, DB에 저장하지 않음) */
  credentials?: PlatformCredentials;
};

export { hasEnvCredentials } from "./platform-credentials.js";

function canLogin(
  platform: Platform,
  credentials?: PlatformCredentials,
): boolean {
  if (credentials?.id?.trim() && credentials.password) return true;
  if (!config.authAutoLogin) return false;
  return hasEnvCredentials(platform);
}

/**
 * Vercel·수동 세션 환경에서는 브라우저 검증을 생략하고 저장된 세션을 신뢰합니다.
 * (서버리스 Chromium 검증이 flaky 하고, 자격증명 없이는 폴백 불가)
 */
function shouldTrustStoredSession(platform: Platform): boolean {
  return config.isVercel || !canLogin(platform);
}

function connectHint(): string {
  return "대시보드에서 「계정 연결」로 다시 로그인해 주세요.";
}

function autoLoginFailureMessage(platform: Platform): string {
  return `${PLATFORMS[platform].name} 연결 만료 + 자동 로그인 실패 — ${connectHint()}`;
}

async function notifyAutoLoginFailure(platform: Platform): Promise<void> {
  await notifyError(new Error(autoLoginFailureMessage(platform)), {
    stage: "세션",
  });
}

/** 글쓰기 URL 접근으로 세션 유효성 확인 */
async function isWritePageAccessible(
  page: Page,
  platform: Platform,
): Promise<boolean> {
  if (platform === "naver") {
    if (!config.naverBlogId) return false;
    try {
      await navigateToWritePage(
        page,
        "naver",
        normalizeNaverBlogId(config.naverBlogId),
      );
      return true;
    } catch {
      return false;
    }
  }

  if (platform === "tistory") {
    if (!config.tistoryBlogName) return false;
    try {
      await navigateToWritePage(
        page,
        "tistory",
        normalizeTistoryBlogName(config.tistoryBlogName),
      );
      return true;
    } catch {
      return false;
    }
  }

  if (platform === "google") {
    if (!config.bloggerBlogId) return false;
    const url = PLATFORMS.google.postWriteUrl(config.bloggerBlogId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await humanPause(3000);

    if (/accounts\.google\.com\/signin/i.test(page.url())) return false;

    const title = page
      .locator('input[aria-label="Title"], textarea[aria-label="Title"]')
      .first();
    return (await title.count()) > 0 && (await title.isVisible());
  }

  return false;
}

async function performAutoLogin(
  platform: Platform,
  credentials: PlatformCredentials,
): Promise<string> {
  const loginSession = await createBrowserSession({
    headless: config.authLoginHeadless,
  });
  const page = await getSessionPage(loginSession);

  try {
    if (platform === "naver") {
      await autoLoginNaver(page, credentials);
      if (config.naverBlogId) {
        await navigateToWritePage(
          page,
          "naver",
          normalizeNaverBlogId(config.naverBlogId),
        );
      }
    } else if (platform === "tistory") {
      await autoLoginTistory(page, credentials);
      if (config.tistoryBlogName) {
        await navigateToWritePage(
          page,
          "tistory",
          normalizeTistoryBlogName(config.tistoryBlogName),
        );
      }
    } else {
      await notifyAutoLoginFailure(platform);
      throw new Error(
        `[${PLATFORMS[platform].name}] 웹 로그인을 지원하지 않습니다.`,
      );
    }

    const ok = await hasLoginCookies(loginSession.context, platform);
    if (!ok) {
      await notifyAutoLoginFailure(platform);
      throw new Error(
        `[${PLATFORMS[platform].name}] 로그인 후에도 연결 상태를 확인할 수 없습니다.`,
      );
    }

    const saved = await saveSession(platform, loginSession.context);
    console.log(
      `[${PLATFORMS[platform].name}] 자동 로그인 → 세션 저장: ${saved}`,
    );
    return saved;
  } finally {
    await page.close();
    await loginSession.close();
  }
}

/**
 * 세션이 유효한지 확인하고, 만료 시 계정으로 자동 로그인 후 세션 저장.
 * @returns storage_state 파일 경로
 */
export async function ensureValidSession(
  platform: Platform,
  options: EnsureSessionOptions = {},
): Promise<string> {
  const headless = config.authLoginHeadless;
  const force =
    Boolean(options.forceRelogin) || Boolean(options.credentials?.id);

  // 1) 기존 세션 (강제 재로그인 아닐 때)
  if (!force && (await hasSession(platform))) {
    const statePath = await requireSession(platform);

    if (shouldTrustStoredSession(platform)) {
      console.log(`[${PLATFORMS[platform].name}] 저장된 세션 사용`);
      return statePath;
    }

    const session = await createBrowserSession({
      headless,
      storageStatePath: statePath,
    });
    const page = await getSessionPage(session);

    try {
      const hasCookies = await hasLoginCookies(session.context, platform);
      if (hasCookies) {
        const accessible = await isWritePageAccessible(page, platform);
        if (accessible) {
          console.log(`[${PLATFORMS[platform].name}] 기존 세션 유효`);
          return statePath;
        }
      }
      console.log(
        `[${PLATFORMS[platform].name}] 세션 만료 감지 — 자동 로그인 시도`,
      );
    } finally {
      await page.close();
      await session.close();
    }
  } else if (force) {
    console.log(
      `[${PLATFORMS[platform].name}] 강제 재로그인 — 웹에서 계정 연결`,
    );
  } else {
    console.log(
      `[${PLATFORMS[platform].name}] 세션 없음 — 자동 로그인 시도`,
    );
  }

  // 2) 자동 로그인
  const credentials = resolveCredentials(platform, options.credentials);
  if (!credentials || (!options.credentials && !config.authAutoLogin)) {
    if (platform === "google") {
      await notifyAutoLoginFailure(platform);
      throw new Error(
        `[${PLATFORMS[platform].name}] Google은 웹 자동 로그인을 지원하지 않습니다.`,
      );
    }
    await notifyAutoLoginFailure(platform);
    throw new Error(
      sessionExpiredMessage(platform) + `\n\n${connectHint()}`,
    );
  }

  if (!canLogin(platform, options.credentials)) {
    await notifyAutoLoginFailure(platform);
    throw new Error(
      sessionExpiredMessage(platform) + `\n\n${connectHint()}`,
    );
  }

  return performAutoLogin(platform, credentials);
}
