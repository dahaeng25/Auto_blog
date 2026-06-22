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

/** 네이버 ID/PW 자동 로그인 */
export async function autoLoginNaver(page: Page): Promise<void> {
  if (!config.naverId || !config.naverPassword) {
    throw new Error(
      "네이버 자동 로그인에 NAVER_ID, NAVER_PASSWORD 가 필요합니다.",
    );
  }

  console.log("[자동 로그인] 네이버 로그인 시도...");
  await page.goto(PLATFORMS.naver.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await humanPause(1500);

  await fillFieldByEvaluate(page, "#id", config.naverId);
  await fillFieldByEvaluate(page, "#pw", config.naverPassword);

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
  await humanClick(loginBtn);
  await humanPause(3000);

  for (let i = 0; i < 30; i++) {
    if (await isNaverLoggedIn(page.context())) {
      console.log("[자동 로그인] 네이버 로그인 성공");
      return;
    }

    if (await isManualAuthScreen(page)) {
      const completed = await waitForManualAuth(
        page,
        () => isNaverLoggedIn(page.context()),
        "네이버",
      );
      if (completed) return;
      throw new Error(
        "네이버 2단계 인증 시간 초과.\n" +
          "  • npm run auth:setup 으로 한 번 수동 로그인 후 세션을 저장하세요.\n" +
          "  • .env 에 AUTH_LOGIN_HEADLESS=false 로 브라우저를 띄운 뒤 재시도하세요.",
      );
    }

    await humanPause(1000);
  }

  throw new Error(
    "네이버 자동 로그인 실패 — ID/PW를 확인하거나 npm run auth:setup 으로 수동 로그인하세요.",
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
        await humanPause(3000);
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
        await humanPause(3000);
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
          await humanPause(2000);
          break;
        }
      } catch {
        // ignore
      }
    }

    await humanPause(1500);
  }
}

/** 티스토리(카카오) 자동 로그인 */
export async function autoLoginTistory(page: Page): Promise<void> {
  const kakaoId = config.kakaoId || config.tistoryId;
  const kakaoPassword = config.kakaoPassword || config.tistoryPassword;

  if (!kakaoId || !kakaoPassword) {
    throw new Error(
      "티스토리 자동 로그인에 KAKAO_ID, KAKAO_PASSWORD (또는 TISTORY_ID/PASSWORD) 가 필요합니다.",
    );
  }

  console.log("[자동 로그인] 티스토리(카카오) 로그인 시도...");
  await page.goto(PLATFORMS.tistory.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await humanPause(2000);

  await clickKakaoLoginOnTistory(page);

  if (!page.url().includes("accounts.kakao.com")) {
    await clickKakaoLoginOnTistory(page);
  }

  if (!page.url().includes("accounts.kakao.com")) {
    console.log("[자동 로그인] 카카오 로그인 페이지로 직접 이동...");
    await page.goto(
      "https://accounts.kakao.com/login/?continue=https%3A%2F%2Fwww.tistory.com%2Fauth%2Fkakao%2Fcallback",
      { waitUntil: "domcontentloaded", timeout: 60_000 },
    );
    await humanPause(2000);
  }

  await fillKakaoLoginForm(page, kakaoId, kakaoPassword);
  await handleKakaoPostLogin(page);

  for (let i = 0; i < 40; i++) {
    if (await isTistoryLoggedIn(page.context())) {
      console.log("[자동 로그인] 티스토리 로그인 성공");
      return;
    }

    if (await isManualAuthScreen(page)) {
      const completed = await waitForManualAuth(
        page,
        () => isTistoryLoggedIn(page.context()),
        "티스토리(카카오)",
      );
      if (completed) return;
      throw new Error(
        "티스토리/카카오 2단계 인증 시간 초과.\n" +
          "  • npm run auth:setup 으로 한 번 수동 로그인 후 세션을 저장하세요.",
      );
    }

    await handleKakaoPostLogin(page);
    await humanPause(1000);
  }

  throw new Error(
    "티스토리 자동 로그인 실패 — 카카오 계정을 확인하거나 npm run auth:setup 을 사용하세요.\n" +
      "  • KAKAO_ID는 카카오 로그인 이메일/전화번호여야 합니다.\n" +
      "  • TISTORY_BLOG_NAME이 블로그 주소와 일치하는지 확인하세요. (예: kanghaeng1345)",
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
