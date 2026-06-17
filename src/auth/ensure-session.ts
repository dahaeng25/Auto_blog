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

function hasCredentials(platform: Platform): boolean {
  if (platform === "naver") {
    return Boolean(config.naverId && config.naverPassword);
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
    const url = PLATFORMS.naver.postWriteUrl(config.naverBlogId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2500);

    if (/nidlogin|nid\.naver\.com\/nidlogin/i.test(page.url())) return false;

    const iframe = page.locator("iframe#mainFrame").first();
    if ((await iframe.count()) === 0) return false;

    const frame = await iframe.elementHandle()?.contentFrame();
    if (!frame) return false;

    const title = frame.locator(".se-documentTitle").first();
    return (await title.count()) > 0;
  }

  if (!config.tistoryBlogName) return false;
  const url = PLATFORMS.tistory.postWriteUrl(config.tistoryBlogName);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await humanPause(2500);

  if (
    /accounts\.kakao\.com|tistory\.com\/auth\/login|kauth\.kakao\.com/i.test(
      page.url(),
    )
  ) {
    return false;
  }

  const title = page.locator("#post-title-inp, input[name='title']").first();
  return (await title.count()) > 0 && (await title.isVisible());
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
        const writeUrl = PLATFORMS.naver.postWriteUrl(config.naverBlogId);
        await page.goto(writeUrl, { waitUntil: "domcontentloaded" });
        await humanPause(3000);
      }
    } else {
      await autoLoginTistory(page);
      if (config.tistoryBlogName) {
        const writeUrl = PLATFORMS.tistory.postWriteUrl(
          config.tistoryBlogName,
        );
        await page.goto(writeUrl, { waitUntil: "domcontentloaded" });
        await humanPause(3000);
      }
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

/** 네이버·티스토리 세션 일괄 갱신 */
export async function ensureAllSessions(): Promise<void> {
  if (config.naverBlogId) {
    await ensureValidSession("naver");
  }
  if (config.tistoryBlogName) {
    await ensureValidSession("tistory");
  }
}
