import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { humanClick, humanPause } from "../publishing/utils/human-input.js";
import {
  isNaverLoggedIn,
  isTistoryLoggedIn,
} from "./login-check.js";
import {
  fillFieldByEvaluate,
  isManualAuthScreen,
  waitForManualAuth,
} from "./auth-wait.js";
import {
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
} from "./write-page-nav.js";
import { reportConnectProgress } from "./connect-progress.js";

/** 플랫폼 로그인에 쓰는 일회성 자격증명 (저장하지 않음) */
export type PlatformCredentials = {
  id: string;
  password: string;
};

/** 서버리스에서는 대기 시간을 줄여 함수 타임아웃 여유를 확보 */
function loginPause(ms: number): Promise<void> {
  const scaled = config.isVercel ? Math.min(ms, Math.round(ms * 0.55)) : ms;
  return humanPause(Math.max(400, scaled));
}

/** 네이버 ID/PW 자동 로그인 */
export async function autoLoginNaver(
  page: Page,
  credentials?: PlatformCredentials,
): Promise<void> {
  const naverId = credentials?.id?.trim() || config.naverId;
  const naverPassword = credentials?.password || config.naverPassword;

  if (!naverId || !naverPassword) {
    throw new Error(
      "네이버 로그인을 위해 아이디와 비밀번호가 필요합니다.",
    );
  }

  console.log("[자동 로그인] 네이버 로그인 시도...");
  await reportConnectProgress("로그인 페이지를 여는 중…");
  await page.goto(PLATFORMS.naver.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await loginPause(1500);

  await reportConnectProgress("아이디를 입력하는 중…");
  await fillFieldByEvaluate(page, "#id", naverId);
  await reportConnectProgress("비밀번호를 입력하는 중…");
  await fillFieldByEvaluate(page, "#pw", naverPassword);

  const keepLogin = page.locator("#keep").first();
  try {
    if ((await keepLogin.count()) > 0 && !(await keepLogin.isChecked())) {
      await humanClick(keepLogin);
    }
  } catch {
    // ignore
  }

  const loginBtn = page
    .locator('#log\\.login, button.btn_login, input.btn_global[type="submit"]')
    .first();
  await reportConnectProgress("로그인 버튼을 누르는 중…");
  await humanClick(loginBtn);
  await loginPause(3000);
  await reportConnectProgress("로그인 결과를 확인하는 중…");

  for (let i = 0; i < 30; i++) {
    if (await isNaverLoggedIn(page.context())) {
      console.log("[자동 로그인] 네이버 로그인 성공");
      return;
    }

    if (await isManualAuthScreen(page)) {
      await reportConnectProgress("추가 인증 화면을 확인하는 중…");
      const completed = await waitForManualAuth(
        page,
        () => isNaverLoggedIn(page.context()),
        "네이버",
      );
      if (completed) return;
      throw new Error(
        "네이버 추가 인증(2단계·보안문자)이 필요해 자동 로그인에 실패했습니다. 잠시 후 다시 연결해 주세요.",
      );
    }

    await loginPause(1000);
  }

  throw new Error(
    "네이버 로그인에 실패했습니다. 아이디·비밀번호를 확인한 뒤 다시 연결해 주세요.",
  );
}

async function clickKakaoLoginOnTistory(page: Page): Promise<void> {
  const selectors = [
    'a[href*="kakao"]',
    'button:has-text("카카오")',
    'a:has-text("카카오")',
    ".btn_kakao",
    '[class*="kakao"]',
    'button:has-text("시작하기")',
  ];

  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await humanClick(btn);
        await loginPause(3000);
        return;
      }
    } catch {
      // 다음 셀렉터
    }
  }
}

async function fillKakaoLoginForm(
  page: Page,
  kakaoId: string,
  kakaoPassword: string,
): Promise<void> {
  const idSelectors = [
    'input[name="loginId"]',
    "#loginId--1",
    'input[type="email"]',
    'input[type="text"][autocomplete="username"]',
  ];
  const pwSelectors = [
    'input[name="password"]',
    "#password--2",
    'input[type="password"]',
  ];

  let idFilled = false;
  for (const sel of idSelectors) {
    try {
      const input = page.locator(sel).first();
      if ((await input.count()) > 0 && (await input.isVisible())) {
        await fillFieldByEvaluate(page, sel, kakaoId);
        idFilled = true;
        break;
      }
    } catch {
      // 다음
    }
  }
  if (!idFilled) {
    throw new Error("카카오 로그인 ID 입력란을 찾을 수 없습니다.");
  }

  let pwFilled = false;
  for (const sel of pwSelectors) {
    try {
      const input = page.locator(sel).first();
      if ((await input.count()) > 0 && (await input.isVisible())) {
        await fillFieldByEvaluate(page, sel, kakaoPassword);
        pwFilled = true;
        break;
      }
    } catch {
      // 다음
    }
  }
  if (!pwFilled) {
    throw new Error("카카오 로그인 비밀번호 입력란을 찾을 수 없습니다.");
  }

  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("로그인")',
    ".btn_confirm",
    ".submit",
    'button.btn_g.highlight',
  ];

  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first();
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await humanClick(btn);
        await loginPause(3000);
        return;
      }
    } catch {
      // 다음
    }
  }

  throw new Error("카카오 로그인 버튼을 찾을 수 없습니다.");
}

/** 카카오 동의·계속하기 화면 처리 */
async function handleKakaoPostLogin(page: Page): Promise<void> {
  const continueSelectors = [
    'button:has-text("동의")',
    'button:has-text("계속")',
    'button:has-text("확인")',
    'button:has-text("Accept")',
    'a:has-text("계속")',
  ];

  for (let attempt = 0; attempt < 5; attempt++) {
    const url = page.url();
    if (
      url.includes("tistory.com") &&
      !url.includes("auth/login") &&
      !url.includes("accounts.kakao.com")
    ) {
      return;
    }

    for (const sel of continueSelectors) {
      const btn = page.locator(sel).first();
      try {
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await humanClick(btn);
          await loginPause(2000);
          break;
        }
      } catch {
        // ignore
      }
    }

    await loginPause(1500);
  }
}

/** 티스토리(카카오) 자동 로그인 */
export async function autoLoginTistory(
  page: Page,
  credentials?: PlatformCredentials,
): Promise<void> {
  const kakaoId =
    credentials?.id?.trim() || config.kakaoId || config.tistoryId;
  const kakaoPassword =
    credentials?.password || config.kakaoPassword || config.tistoryPassword;

  if (!kakaoId || !kakaoPassword) {
    throw new Error(
      "티스토리(카카오) 로그인을 위해 아이디와 비밀번호가 필요합니다.",
    );
  }

  console.log("[자동 로그인] 티스토리(카카오) 로그인 시도...");
  await reportConnectProgress("티스토리 로그인 페이지를 여는 중…");
  await page.goto(PLATFORMS.tistory.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await loginPause(2000);

  await reportConnectProgress("카카오 로그인으로 이동하는 중…");
  await clickKakaoLoginOnTistory(page);

  if (!page.url().includes("accounts.kakao.com")) {
    await clickKakaoLoginOnTistory(page);
  }

  if (!page.url().includes("accounts.kakao.com")) {
    console.log("[자동 로그인] 카카오 로그인 페이지로 직접 이동...");
    await reportConnectProgress("카카오 로그인 페이지를 여는 중…");
    await page.goto(
      "https://accounts.kakao.com/login/?continue=https%3A%2F%2Fwww.tistory.com%2Fauth%2Fkakao%2Fcallback",
      { waitUntil: "domcontentloaded", timeout: 60_000 },
    );
    await loginPause(2000);
  }

  await reportConnectProgress("카카오 아이디·비밀번호를 입력하는 중…");
  await fillKakaoLoginForm(page, kakaoId, kakaoPassword);
  await handleKakaoPostLogin(page);
  await reportConnectProgress("로그인 결과를 확인하는 중…");

  for (let i = 0; i < 40; i++) {
    if (await isTistoryLoggedIn(page.context())) {
      console.log("[자동 로그인] 티스토리 로그인 성공");
      return;
    }

    if (await isManualAuthScreen(page)) {
      await reportConnectProgress("추가 인증 화면을 확인하는 중…");
      const completed = await waitForManualAuth(
        page,
        () => isTistoryLoggedIn(page.context()),
        "티스토리(카카오)",
      );
      if (completed) return;
      throw new Error(
        "티스토리/카카오 추가 인증이 필요해 자동 로그인에 실패했습니다. 잠시 후 다시 연결해 주세요.",
      );
    }

    await handleKakaoPostLogin(page);
    await loginPause(1000);
  }

  throw new Error(
    "티스토리 로그인에 실패했습니다. 카카오 아이디·비밀번호를 확인한 뒤 다시 연결해 주세요.",
  );
}

/** 글쓰기 페이지 방문으로 세션 쿠키 확보 */
export async function visitWritePageForSession(page: Page): Promise<void> {
  if (config.naverBlogId) {
    await navigateToWritePage(
      page,
      "naver",
      normalizeNaverBlogId(config.naverBlogId),
    );
  }
  if (config.tistoryBlogName) {
    await navigateToWritePage(
      page,
      "tistory",
      normalizeTistoryBlogName(config.tistoryBlogName),
    );
  }
}
