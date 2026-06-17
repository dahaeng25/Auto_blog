import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { humanClick, humanPause } from "../publishing/utils/human-input.js";
import {
  isNaverLoggedIn,
  isTistoryLoggedIn,
} from "./login-check.js";

/** 네이버 로그인 폼 — paste 차단 우회 */
async function fillNaverField(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const input = page.locator(selector).first();
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await humanClick(input);
  await humanPause(200);

  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
  );
  await humanPause(300);
}

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

  await fillNaverField(page, "#id", config.naverId);
  await fillNaverField(page, "#pw", config.naverPassword);

  // 로그인 상태 유지
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

  // 로그인 완료 대기 (최대 30초)
  for (let i = 0; i < 30; i++) {
    const url = page.url();
    if (!/nidlogin|nid\.naver\.com\/nidlogin/i.test(url)) {
      const loggedIn = await isNaverLoggedIn(page.context());
      if (loggedIn) {
        console.log("[자동 로그인] 네이버 로그인 성공");
        return;
      }
    }

    // 캡차/2단계 인증 화면
    const captcha = page.locator("#captcha, .captcha, #otp, .otp").first();
    if ((await captcha.count()) > 0 && (await captcha.isVisible())) {
      throw new Error(
        "네이버 캡차/2단계 인증이 필요합니다. " +
          "브라우저에서 직접 완료하려면 npm run auth:setup 을 사용하세요.",
      );
    }

    await humanPause(1000);
  }

  throw new Error(
    "네이버 자동 로그인 실패 — ID/PW를 확인하거나 npm run auth:setup 으로 수동 로그인하세요.",
  );
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

  // 카카오 로그인 버튼
  const kakaoBtn = page
    .locator(
      'a[href*="kakao"], button:has-text("카카오"), .btn_kakao, [class*="kakao"]',
    )
    .first();

  if ((await kakaoBtn.count()) > 0 && (await kakaoBtn.isVisible())) {
    await humanClick(kakaoBtn);
    await humanPause(3000);
  }

  // 카카오 로그인 폼
  const idInput = page
    .locator('input[name="loginId"], input#loginId--1, input[type="text"]')
    .first();
  const pwInput = page
    .locator('input[name="password"], input#password--2, input[type="password"]')
    .first();

  await idInput.waitFor({ state: "visible", timeout: 20_000 });
  await humanClick(idInput);
  await idInput.fill(kakaoId);
  await humanPause(300);

  await humanClick(pwInput);
  await pwInput.fill(kakaoPassword);
  await humanPause(300);

  const submitBtn = page
    .locator(
      'button[type="submit"], button:has-text("로그인"), .btn_confirm, .submit',
    )
    .first();
  await humanClick(submitBtn);
  await humanPause(4000);

  for (let i = 0; i < 40; i++) {
    const url = page.url();
    if (
      url.includes("tistory.com") &&
      !url.includes("auth/login") &&
      !url.includes("accounts.kakao.com")
    ) {
      const loggedIn = await isTistoryLoggedIn(page.context());
      if (loggedIn) {
        console.log("[자동 로그인] 티스토리 로그인 성공");
        return;
      }
    }

    await humanPause(1000);
  }

  throw new Error(
    "티스토리 자동 로그인 실패 — 카카오 계정을 확인하거나 npm run auth:setup 을 사용하세요.",
  );
}

/** 글쓰기 페이지 방문으로 세션 쿠키 확보 */
export async function visitWritePageForSession(page: Page): Promise<void> {
  if (config.naverBlogId) {
    const url = PLATFORMS.naver.postWriteUrl(config.naverBlogId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2000);
  }
  if (config.tistoryBlogName) {
    const url = PLATFORMS.tistory.postWriteUrl(config.tistoryBlogName);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2000);
  }
}
