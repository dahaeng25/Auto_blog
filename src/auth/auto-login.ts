import type { Locator, Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import {
  humanClickSafe,
  humanPause,
} from "../publishing/utils/human-input.js";
import {
  isNaverLoggedIn,
  isTistoryLoggedIn,
} from "./login-check.js";
import {
  captureConnectScreenshot,
  describeLoginPage,
  fillLoginField,
  waitForLoginComplete,
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

/** 서버리스: 입력 단계만 짧게, 인증 대기는 축소하지 않음 */
function loginPause(ms: number, phase: "input" | "wait" = "input"): Promise<void> {
  const scaled =
    config.isVercel && phase === "input"
      ? Math.min(ms, Math.round(ms * 0.6))
      : ms;
  return humanPause(Math.max(phase === "wait" ? 1500 : 400, scaled));
}

function loginWaitBudgetMs(): number {
  return config.isVercel
    ? Math.max(config.auth2faWaitMs, 180_000)
    : Math.max(config.auth2faWaitMs, 120_000);
}

/** 영문 글로벌 UI면 한국어로 전환 (셀렉터·2FA UX 안정화) */
async function ensureNaverKoreanLocale(page: Page): Promise<void> {
  try {
    const body = await page.locator("body").innerText({ timeout: 3000 });
    if (/로그인/.test(body) && /비밀번호/.test(body)) return;

    const koBtn = page.locator('button.btn_language[data-lang="ko"]').first();
    if ((await koBtn.count()) > 0 && (await koBtn.isVisible())) {
      await humanClickSafe(koBtn, 5_000);
      await loginPause(1200);
      return;
    }

    // URL locale 파라미터가 무시된 경우 강제 재진입
    if (!/locale=ko/i.test(page.url())) {
      await page.goto(
        "https://nid.naver.com/nidlogin.login?locale=ko_KR&lang=ko_KR",
        { waitUntil: "domcontentloaded", timeout: 60_000 },
      );
      await loginPause(1200);
    }
  } catch {
    // ignore
  }
}

/** 신·구 UI / 한·영 / column·row 중 실제로 보이는 로그인 버튼 */
async function findNaverLoginButton(page: Page): Promise<Locator> {
  const selectors = [
    "#loginBtn_column",
    "#loginBtn_row",
    '#log\\.login',
    "button.btn_login",
    'input.btn_global[type="submit"]',
    'button.btn_done:has-text("로그인")',
    'button.btn_done:has-text("Sign in")',
  ];

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          return loc;
        }
      } catch {
        // next
      }
    }
    // role 기반 폴백 (텍스트만 보이는 경우)
    const byRole = page.getByRole("button", { name: /^(로그인|Sign in)$/i });
    try {
      if ((await byRole.count()) > 0 && (await byRole.first().isVisible())) {
        return byRole.first();
      }
    } catch {
      // ignore
    }
    await loginPause(400);
  }

  throw new Error(
    "네이버 로그인 버튼을 찾을 수 없습니다. 페이지 구조가 바뀌었거나 캡차가 표시됐을 수 있습니다.",
  );
}

/**
 * 로그인 제출 — auth:setup처럼 클릭하되, 서버리스에서 클릭 고착을 막음.
 * Enter / form.requestSubmit 폴백으로 네이버가 실제 로그인·2FA를 타도록 함.
 */
async function submitLoginForm(
  page: Page,
  loginBtn: Locator,
  platformLabel: string,
): Promise<void> {
  const beforeUrl = page.url();
  await reportConnectProgress(`${platformLabel} 로그인 버튼을 누르는 중…`);

  let method = "none";
  try {
    method = await humanClickSafe(loginBtn, 12_000);
    console.log(`[자동 로그인] ${platformLabel} 로그인 클릭: ${method}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[자동 로그인] ${platformLabel} 클릭 실패 — Enter/form 폴백: ${reason}`);
  }

  // 클릭이 먹히지 않으면 Enter → form submit
  await loginPause(800, "wait");
  if (page.url() === beforeUrl) {
    try {
      await page.keyboard.press("Enter");
      method = method === "none" ? "enter" : `${method}+enter`;
      await loginPause(800, "wait");
    } catch {
      // ignore
    }
  }

  if (page.url() === beforeUrl) {
    try {
      const submitted = await page.evaluate(() => {
        const form =
          document.querySelector<HTMLFormElement>("form#frmNIDLogin") ||
          document.querySelector<HTMLFormElement>("form[name='frmNIDLogin']") ||
          document.querySelector<HTMLFormElement>("form");
        if (!form) return false;
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
          return true;
        }
        form.submit();
        return true;
      });
      if (submitted) method = `${method}+form`;
    } catch {
      // ignore
    }
  }

  await loginPause(2500, "wait");
  const screen = await describeLoginPage(page);
  await reportConnectProgress(
    `${platformLabel} 로그인 요청을 보냈습니다 (${method}). ${screen}`,
  );
  await captureConnectScreenshot(page, "로그인 결과를 확인하는 중…");

  // 여전히 입력 화면이면 자격증명/봇 차단 가능성 안내
  if (/로그인 입력 화면|네이버 로그인 화면|카카오 로그인 화면/.test(screen)) {
    await reportConnectProgress(
      `${platformLabel} 아직 로그인 화면입니다. 휴대폰 알림이 없으면 아이디·비밀번호를 확인하거나, 로컬에서 「브라우저에서 직접 로그인」(auth:setup)을 사용해 주세요.`,
    );
  }
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
  await reportConnectProgress("네이버 로그인 페이지를 여는 중…");
  await page.goto(PLATFORMS.naver.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await loginPause(1500);
  await ensureNaverKoreanLocale(page);
  await reportConnectProgress(`네이버 ${await describeLoginPage(page)}`);
  await captureConnectScreenshot(page);

  await reportConnectProgress("네이버 아이디를 입력하는 중…");
  await fillLoginField(page, "#id", naverId);
  await reportConnectProgress("네이버 비밀번호를 입력하는 중…");
  await fillLoginField(page, "#pw", naverPassword);

  // 구 UI #keep / 신 UI #loginStay
  for (const keepSel of ["#keep", "#loginStay"]) {
    const keepLogin = page.locator(keepSel).first();
    try {
      if ((await keepLogin.count()) > 0 && !(await keepLogin.isChecked())) {
        await humanClickSafe(keepLogin, 8_000);
        await reportConnectProgress("로그인 상태 유지를 선택했습니다.");
        break;
      }
    } catch {
      // ignore
    }
  }

  const loginBtn = await findNaverLoginButton(page);
  await submitLoginForm(page, loginBtn, "네이버");

  const loggedIn = await waitForLoginComplete(
    page,
    () => isNaverLoggedIn(page.context()),
    "네이버",
    { maxWaitMs: loginWaitBudgetMs() },
  );

  if (loggedIn) {
    console.log("[자동 로그인] 네이버 로그인 성공");
    return;
  }

  const screen = await describeLoginPage(page);
  throw new Error(
    `네이버 로그인에 실패했습니다. (${screen}) 아이디·비밀번호를 확인하거나, 휴대폰 네이버 앱에서 승인한 뒤 다시 연결해 주세요.`,
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
        await humanClickSafe(btn);
        await loginPause(3000, "wait");
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
        await fillLoginField(page, sel, kakaoId);
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
        await fillLoginField(page, sel, kakaoPassword);
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
        await submitLoginForm(page, btn, "카카오");
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
          await reportConnectProgress("카카오 연결 동의를 진행하는 중…");
          await humanClickSafe(btn);
          await loginPause(2000, "wait");
          break;
        }
      } catch {
        // ignore
      }
    }

    await loginPause(1500, "wait");
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
  await reportConnectProgress(`티스토리 ${await describeLoginPage(page)}`);
  await captureConnectScreenshot(page);

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
    await reportConnectProgress(`카카오 ${await describeLoginPage(page)}`);
    await captureConnectScreenshot(page);
  }

  await reportConnectProgress("카카오 아이디·비밀번호를 입력하는 중…");
  await fillKakaoLoginForm(page, kakaoId, kakaoPassword);
  await handleKakaoPostLogin(page);
  await reportConnectProgress("카카오 인증 여부를 확인하는 중…");
  await captureConnectScreenshot(page, "로그인 결과를 확인하는 중…");

  const loggedIn = await waitForLoginComplete(
    page,
    () => isTistoryLoggedIn(page.context()),
    "티스토리",
    { maxWaitMs: loginWaitBudgetMs() },
  );

  if (loggedIn) {
    console.log("[자동 로그인] 티스토리 로그인 성공");
    return;
  }

  const screen = await describeLoginPage(page);
  throw new Error(
    `티스토리 로그인에 실패했습니다. (${screen}) 카카오 계정을 확인하거나, 휴대폰 카카오톡에서 승인한 뒤 다시 연결해 주세요.`,
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
