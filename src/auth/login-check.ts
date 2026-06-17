import type { BrowserContext, Page } from "playwright";
import { PLATFORMS, type Platform } from "../../config/platforms.js";

/** 세션 만료 시 안내 메시지 */
export function sessionExpiredMessage(platform: Platform): string {
  const name = PLATFORMS[platform].name;
  return (
    `[${name}] 로그인 세션이 만료되었거나 유효하지 않습니다.\n` +
    `글쓰기 화면 대신 로그인 페이지가 열렸을 수 있습니다.\n\n` +
    `해결 방법:\n` +
    `  1. npm run auth:setup  (브라우저에서 다시 로그인)\n` +
    `  2. .env 에 PUBLISH_HEADLESS=false 설정 후 재시도\n` +
    `  3. npm run auth:verify 로 세션 상태 확인`
  );
}

export async function isNaverLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.naver.com");
  return cookies.some((c) => c.name === "NID_AUT" || c.name === "NID_SES");
}

export async function isTistoryLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.tistory.com");
  return cookies.some((c) => c.name === "TSSESSION");
}

export async function isGoogleLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.blogger.com");
  return cookies.some(
    (c) =>
      c.name.startsWith("SID") ||
      c.name === "__Secure-1PSID" ||
      c.name === "HSID",
  );
}

const COOKIE_CHECKERS: Record<
  Platform,
  (ctx: BrowserContext) => Promise<boolean>
> = {
  naver: isNaverLoggedIn,
  tistory: isTistoryLoggedIn,
  google: isGoogleLoggedIn,
};

/** storage_state 쿠키만으로 1차 검사 */
export async function hasLoginCookies(
  context: BrowserContext,
  platform: Platform,
): Promise<boolean> {
  return COOKIE_CHECKERS[platform](context);
}

/** 글쓰기 페이지 URL·DOM으로 로그인 여부 확인 */
export async function assertEditorAccessible(
  page: Page,
  platform: Platform,
): Promise<void> {
  const url = page.url();

  if (platform === "naver") {
    if (/nidlogin|nid\.naver\.com\/nidlogin/i.test(url)) {
      throw new Error(sessionExpiredMessage(platform));
    }

    const loginId = page.locator('input#id, input[name="id"]').first();
    try {
      if ((await loginId.count()) > 0 && (await loginId.isVisible())) {
        throw new Error(sessionExpiredMessage(platform));
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("로그인 세션")) throw e;
    }

    return;
  }

  if (platform === "tistory") {
    if (
      /accounts\.kakao\.com|tistory\.com\/auth\/login/i.test(url) ||
      url.includes("kauth.kakao.com")
    ) {
      throw new Error(sessionExpiredMessage(platform));
    }
  }

  if (platform === "google") {
    if (
      /accounts\.google\.com\/signin|accounts\.google\.com\/v3\/signin/i.test(
        url,
      )
    ) {
      throw new Error(sessionExpiredMessage(platform));
    }
  }
}
