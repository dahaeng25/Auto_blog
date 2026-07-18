import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import {
  createBrowserSession,
  createManualChromeSession,
  getSessionPage,
} from "./browser-factory.js";
import {
  autoLoginNaver,
  autoLoginTistory,
  type PlatformCredentials,
} from "./auto-login.js";
import {
  bindConnectProgress,
  reportConnectProgress,
  unbindConnectProgress,
} from "./connect-progress.js";
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
import { isManualAuthScreen, captureConnectScreenshot } from "./auth-wait.js";
import { startRemoteBrowserControl } from "./remote-browser-control.js";

export type EnsureSessionOptions = {
  /** 저장된 세션을 무시하고 다시 로그인 */
  forceRelogin?: boolean;
  /** 일회성 자격증명 (요청에만 사용, DB에 저장하지 않음) */
  credentials?: PlatformCredentials;
  /** 직접 로그인(브라우저 창 또는 화면 미리보기) */
  manual?: boolean;
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

async function captureLoginPreview(page: Page): Promise<void> {
  await captureConnectScreenshot(page, "로그인 화면을 확인하는 중…");
}

async function finalizeLoginSession(
  platform: Platform,
  loginSession: Awaited<ReturnType<typeof createBrowserSession>>,
  page: Page,
): Promise<string> {
  await reportConnectProgress("로그인 상태를 확인하는 중…");

  const ok = await hasLoginCookies(loginSession.context, platform);
  if (!ok) {
    await notifyAutoLoginFailure(platform);
    throw new Error(
      `[${PLATFORMS[platform].name}] 로그인 후에도 연결 상태를 확인할 수 없습니다.`,
    );
  }

  if (platform === "naver" && config.naverBlogId) {
    await reportConnectProgress("글쓰기 화면을 확인하는 중…");
    await navigateToWritePage(
      page,
      "naver",
      normalizeNaverBlogId(config.naverBlogId),
    );
  } else if (platform === "tistory" && config.tistoryBlogName) {
    await reportConnectProgress("글쓰기 화면을 확인하는 중…");
    await navigateToWritePage(
      page,
      "tistory",
      normalizeTistoryBlogName(config.tistoryBlogName),
    );
  }

  await reportConnectProgress("연결 정보를 저장하는 중…");
  const saved = await saveSession(platform, loginSession.context);
  console.log(
    `[${PLATFORMS[platform].name}] 로그인 → 세션 저장: ${saved}`,
  );
  return saved;
}

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

/** 로컬에서 보이는 Chrome 창으로 로그인할지 (AUTH_LOGIN_HEADLESS=true 면 제외) */
function preferVisibleChrome(): boolean {
  return !config.isVercel && !config.authLoginHeadless;
}

/** 로컬: headed 창에서 사용자가 직접 로그인 / Vercel: 화면 미리보기 + 대기 */
async function performManualLogin(
  platform: Platform,
  credentials?: PlatformCredentials,
): Promise<string> {
  const headed = preferVisibleChrome();
  bindConnectProgress(platform);

  const loginSession = headed
    ? await createManualChromeSession(platform)
    : await createBrowserSession({ headless: true });
  const page = await getSessionPage(loginSession);
  const stopRemoteControl = !headed
    ? await startRemoteBrowserControl(platform, page)
    : null;

  try {
    // 로컬 Chrome + 자격증명: 자동 입력 후 캡차만 창에서 직접 처리
    if (headed && credentials?.id && credentials.password) {
      await reportConnectProgress(
        "Chrome 창을 여는 중… 아이디·비밀번호는 자동 입력되고, 캡차·인증은 열린 창에서 직접 입력하세요.",
      );
      if (platform === "naver") {
        await autoLoginNaver(page, credentials);
      } else if (platform === "tistory") {
        await autoLoginTistory(page, credentials);
      } else {
        throw new Error(
          `[${PLATFORMS[platform].name}] 웹 로그인을 지원하지 않습니다.`,
        );
      }
      return await finalizeLoginSession(platform, loginSession, page);
    }

    if (headed) {
      await reportConnectProgress(
        "Chrome 창을 여는 중… 열린 창에서 직접 로그인해 주세요. 캡차·2단계도 그 창에서 입력하면 됩니다.",
      );
    } else {
      await reportConnectProgress(
        "로그인 화면을 준비하는 중… Vercel에서는 PC Chrome 창을 열 수 없습니다. 캡차는 로컬 서버의 「Chrome에서 직접 로그인」을 권장합니다.",
      );
    }

    const loginUrl = PLATFORMS[platform].loginUrl;
    await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await humanPause(1500);
    await captureLoginPreview(page);

    // Vercel: 자격증명이 있으면 자동 입력까지 시도(캡차는 원격 조작 또는 로컬 재시도)
    if (!headed && credentials?.id && credentials.password) {
      await reportConnectProgress("아이디·비밀번호를 입력하는 중…");
      if (platform === "naver") {
        await autoLoginNaver(page, credentials);
      } else if (platform === "tistory") {
        await autoLoginTistory(page, credentials);
      }
      await captureLoginPreview(page);
      return await finalizeLoginSession(platform, loginSession, page);
    }

    if (headed) {
      await reportConnectProgress(
        "Chrome 창에서 로그인을 완료해 주세요. 완료되면 자동으로 연결됩니다.",
      );
    }

    const deadline = Date.now() + (headed ? 5 * 60_000 : config.auth2faWaitMs);
    let previewAt = 0;
    let progressAt = 0;

    while (Date.now() < deadline) {
      if (await hasLoginCookies(loginSession.context, platform)) {
        return await finalizeLoginSession(platform, loginSession, page);
      }

      if (await isManualAuthScreen(page)) {
        await reportConnectProgress(
          headed
            ? "추가 인증 화면입니다. Chrome 창에서 캡차·인증을 직접 완료해 주세요."
            : "추가 인증이 필요합니다. 원격 미리보기로 조작하거나, 로컬에서 Chrome 직접 로그인을 이용해 주세요.",
        );
        await captureLoginPreview(page);
      } else if (headed) {
        if (Date.now() - progressAt > 8000) {
          progressAt = Date.now();
          await reportConnectProgress("Chrome 창에서 로그인을 기다리는 중…");
        }
      } else if (Date.now() - previewAt > 8000) {
        previewAt = Date.now();
        await captureLoginPreview(page);
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        await reportConnectProgress(`로그인 진행을 확인하는 중… (${remaining}초 남음)`);
      }

      await humanPause(2000);
    }

    throw new Error(
      headed
        ? "직접 로그인 시간이 초과되었습니다. Chrome 창에서 로그인한 뒤 다시 시도해 주세요."
        : "로그인 확인 시간이 초과되었습니다. 캡차·2단계 인증은 로컬 서버에서 「Chrome에서 직접 로그인」을 이용해 주세요.",
    );
  } finally {
    await stopRemoteControl?.();
    await page.close();
    await loginSession.close();
    unbindConnectProgress();
  }
}

async function performAutoLogin(
  platform: Platform,
  credentials: PlatformCredentials,
): Promise<string> {
  bindConnectProgress(platform);

  const useChrome = preferVisibleChrome();
  await reportConnectProgress(
    useChrome
      ? "Chrome 창을 여는 중… 캡차·추가 인증은 열린 창에서 직접 입력하세요."
      : "브라우저를 준비하는 중…",
  );

  const loginSession = useChrome
    ? await createManualChromeSession(platform)
    : await createBrowserSession({
        headless: config.isVercel ? true : config.authLoginHeadless,
      });
  const page = await getSessionPage(loginSession);
  // 원격 입력 큐는 Vercel(서버리스)에서만 — 로컬은 Chrome 창에서 직접 입력
  const stopRemoteControl = config.isVercel
    ? await startRemoteBrowserControl(platform, page)
    : null;

  try {
    if (platform === "naver") {
      await autoLoginNaver(page, credentials);
      if (config.naverBlogId) {
        await reportConnectProgress("글쓰기 화면을 확인하는 중…");
        await navigateToWritePage(
          page,
          "naver",
          normalizeNaverBlogId(config.naverBlogId),
        );
      }
    } else if (platform === "tistory") {
      await autoLoginTistory(page, credentials);
      if (config.tistoryBlogName) {
        await reportConnectProgress("글쓰기 화면을 확인하는 중…");
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

    return await finalizeLoginSession(platform, loginSession, page);
  } finally {
    await stopRemoteControl?.();
    await page.close();
    await loginSession.close();
    unbindConnectProgress();
  }
}

export async function ensureValidSession(
  platform: Platform,
  options: EnsureSessionOptions = {},
): Promise<string> {
  const headless = config.authLoginHeadless;
  const force =
    Boolean(options.forceRelogin) || Boolean(options.credentials?.id);

  if (options.manual) {
    const credentials = resolveCredentials(platform, options.credentials);
    return performManualLogin(platform, credentials ?? undefined);
  }

  if (!force && (await hasSession(platform))) {
    const statePath = await requireSession(platform);

    if (shouldTrustStoredSession(platform)) {
      console.log(`[${PLATFORMS[platform].name}] 저장된 세션 사용`);
      return statePath;
    }

    bindConnectProgress(platform);
    await reportConnectProgress("저장된 연결을 확인하는 중…");
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
      unbindConnectProgress();
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

  const credentials = resolveCredentials(platform, options.credentials);
  if (!credentials) {
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

  const userInitiated =
    force || Boolean(options.credentials?.id && options.credentials.password);
  if (!userInitiated && !config.authAutoLogin) {
    await notifyAutoLoginFailure(platform);
    throw new Error(
      sessionExpiredMessage(platform) + `\n\n${connectHint()}`,
    );
  }

  return performAutoLogin(platform, credentials);
}
