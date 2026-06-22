import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { createBrowserSession } from "./browser-factory.js";
import {
  autoLoginNaver,
  autoLoginTistory,
  visitWritePageForSession,
} from "./auto-login.js";
import { hasLoginCookies, sessionExpiredMessage } from "./login-check.js";
import {
  getStateFilePath,
  hasSession,
  saveSession,
} from "./session-manager.js";
import { humanPause } from "../publishing/utils/human-input.js";
import {
  isWriteEditorVisible,
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
} from "./write-page-nav.js";

function hasCredentials(platform: Platform): boolean {
  if (platform === "naver") {
    return Boolean(config.naverId && config.naverPassword);
  }
  if (platform === "google") {
    return false;
  }
  const id = config.kakaoId || config.tistoryId;
  const pw = config.kakaoPassword || config.tistoryPassword;
  return Boolean(id && pw);
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

/**
 * 세션이 유효한지 확인하고, 만료 시 .env 계정으로 자동 로그인 후 세션 저장.
 * @returns storage_state 파일 경로
 */
export async function ensureValidSession(platform: Platform): Promise<string> {
  const statePath = getStateFilePath(platform);
  const headless = config.authLoginHeadless;

  // 1) 기존 세션으로 검증
  if (await hasSession(platform)) {
    const session = await createBrowserSession({
      headless,
      storageStatePath: statePath,
    });
    const page = await session.context.newPage();

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
  } else {
    console.log(
      `[${PLATFORMS[platform].name}] 세션 파일 없음 — 자동 로그인 시도`,
    );
  }

  // 2) 자동 로그인
  if (!config.authAutoLogin) {
    throw new Error(
      sessionExpiredMessage(platform) +
        "\n\n또는 .env 에 AUTH_AUTO_LOGIN=true 와 계정 정보를 설정하세요.",
    );
  }

  if (!hasCredentials(platform)) {
    if (platform === "google") {
      throw new Error(
        `[${PLATFORMS[platform].name}] Google은 자동 로그인을 지원하지 않습니다.\n` +
          "  npm run auth:setup 으로 브라우저에서 수동 로그인 후 세션을 저장하세요.",
      );
    }
    throw new Error(
      `[${PLATFORMS[platform].name}] 자동 로그인 계정이 없습니다.\n` +
        (platform === "naver"
          ? "  .env → NAVER_ID, NAVER_PASSWORD\n"
          : "  .env → KAKAO_ID, KAKAO_PASSWORD\n") +
        "  또는 npm run auth:setup 으로 수동 로그인",
    );
  }

  const loginSession = await createBrowserSession({
    headless: config.authLoginHeadless,
  });
  const page = await loginSession.context.newPage();

  try {
    if (platform === "naver") {
      await autoLoginNaver(page);
      if (config.naverBlogId) {
        await navigateToWritePage(
          page,
          "naver",
          normalizeNaverBlogId(config.naverBlogId),
        );
      }
    } else if (platform === "tistory") {
      await autoLoginTistory(page);
      if (config.tistoryBlogName) {
        await navigateToWritePage(
          page,
          "tistory",
          normalizeTistoryBlogName(config.tistoryBlogName),
        );
      }
    } else {
      throw new Error(
        `[${PLATFORMS[platform].name}] 자동 로그인 미지원 — npm run auth:setup 사용`,
      );
    }

    const ok = await hasLoginCookies(loginSession.context, platform);
    if (!ok) {
      throw new Error(
        `[${PLATFORMS[platform].name}] 자동 로그인 후에도 세션 확인 실패`,
      );
    }

    const saved = await saveSession(platform, loginSession.context);
    console.log(`[${PLATFORMS[platform].name}] 자동 로그인 → 세션 저장: ${saved}`);
    return saved;
  } finally {
    await page.close();
    await loginSession.close();
  }
}

/** 활성화된 플랫폼 세션 일괄 갱신 */
export async function ensureAllSessions(): Promise<void> {
  const { getEnabledPlatforms, platformBlogIdConfigured } = await import(
    "../../config/publish-platforms.js"
  );

  for (const platform of getEnabledPlatforms()) {
    if (platformBlogIdConfigured(platform)) {
      await ensureValidSession(platform);
    }
  }
}
