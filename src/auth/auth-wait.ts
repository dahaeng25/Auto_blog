import type { Page } from "playwright";
import { config } from "../../config/index.js";
import {
  humanClickSafe,
  humanPause,
  randomTypingDelay,
} from "../publishing/utils/human-input.js";
import { reportConnectProgress } from "./connect-progress.js";

/**
 * DOM value 직접 설정 — paste 차단 우회용 폴백.
 * 네이버는 키보드 입력이 없으면 비밀번호 암호화(ipad)가 안 되어 로그인이 무시될 수 있음.
 */
export async function fillFieldByEvaluate(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const input = page.locator(selector).first();
  await input.waitFor({ state: "visible", timeout: 20_000 });

  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: val, inputType: "insertText" }),
      );
    },
    { sel: selector, val: value },
  );
  await humanPause(300);
}

/**
 * auth:setup(수동 타이핑)과 동일하게 실제 키 입력으로 채움.
 * 네이버·카카오 로그인 JS(암호화·유효성)가 반응하도록 함.
 */
export async function fillLoginField(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const input = page.locator(selector).first();
  await input.waitFor({ state: "visible", timeout: 20_000 });

  try {
    await humanClickSafe(input, 8_000);
    await humanPause(120);
    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await humanPause(60);
    await input.press("Backspace");
    await humanPause(80);
    await input.pressSequentially(value, { delay: randomTypingDelay() });
    await humanPause(200);

    const current = await input.inputValue().catch(() => "");
    if (current === value) return;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[fillLoginField] 키보드 입력 실패 → evaluate 폴백: ${reason}`);
  }

  await fillFieldByEvaluate(page, selector, value);
}

/** 연결 진행 중 화면 캡처 (Vercel·수동 로그인 시 미리보기용) */
export async function captureConnectScreenshot(
  page: Page,
  caption = "화면을 확인하는 중…",
): Promise<void> {
  if (config.authLoginHeadless && !config.isVercel) return;
  try {
    const shot = await page.screenshot({ type: "jpeg", quality: 52 });
    await reportConnectProgress(caption, shot);
  } catch {
    // ignore
  }
}

/** 현재 페이지 상태를 사람이 읽을 수 있는 한 줄로 */
export async function describeLoginPage(page: Page): Promise<string> {
  const url = page.url();
  try {
    const text = await page.locator("body").innerText({ timeout: 4000 });
    const compact = text.replace(/\s+/g, " ").slice(0, 400);

    if (/2단계|two.?step/i.test(compact) || /2단계|two.?step/i.test(url)) {
      return "2단계 인증 화면";
    }
    if (/새로운 기기|기기 등록|기기 인증|새 기기/i.test(compact)) {
      return "새 기기 인증 화면";
    }
    if (/앱에서|스마트폰|휴대폰.*인증|알림.*확인|푸시/i.test(compact)) {
      return "휴대폰 앱 인증 대기 화면";
    }
    if (/인증번호|OTP|otp/i.test(compact)) {
      return "인증번호 입력 화면";
    }
    if (/캡차|자동입력 방지|보안문자/i.test(compact)) {
      return "보안문자(캡차) 화면";
    }
    if (/카카오톡.*인증|카톡.*인증/i.test(compact)) {
      return "카카오톡 인증 대기 화면";
    }
    if (/로그인/.test(compact) && /아이디|비밀번호|이메일/.test(compact)) {
      return "로그인 입력 화면";
    }
    if (/Sign in/i.test(compact) && /Password|ID or phone/i.test(compact)) {
      return "로그인 입력 화면";
    }
    if (/동의|계속|Accept/i.test(compact)) {
      return "동의·연결 화면";
    }
  } catch {
    // ignore
  }

  if (/accounts\.kakao\.com/i.test(url)) return "카카오 로그인 화면";
  if (/nid\.naver\.com/i.test(url)) return "네이버 로그인 화면";
  if (/tistory\.com/i.test(url)) return "티스토리 화면";
  return "로그인 진행 중";
}

/** 캡차·2단계 인증·기기 확인 화면 여부 */
export async function isManualAuthScreen(page: Page): Promise<boolean> {
  const patterns = [
    "#captcha",
    ".captcha",
    "#otp",
    ".otp",
    "#twoStep",
    '[class*="two_step"]',
    '[class*="twoStep"]',
    '[class*="twostep"]',
    'input[name="otp"]',
    'input[placeholder*="인증"]',
    'input[placeholder*="번호"]',
    "text=2단계",
    "text=본인확인",
    "text=기기 인증",
    "text=기기 등록",
    "text=새로운 기기",
    "text=새 기기",
    "text=휴대폰 인증",
    "text=스마트폰",
    "text=앱에서",
    "text=앱에서 로그인",
    "text=앱에서 확인",
    "text=알림을 확인",
    "text=카카오톡으로",
    "text=인증번호",
    "text=보안문자",
    "text=자동입력 방지",
    "#phoneNumber",
    ".box_verify",
    ".device_confirm",
    '[class*="device"]',
    '[class*="push"]',
  ];

  for (const sel of patterns) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  const url = page.url();
  if (/two.?step|otp|verify|device|challenge|captcha|authNum/i.test(url)) {
    return !/nid\.naver\.com\/nidlogin\.login$/i.test(url);
  }

  try {
    const body = await page.locator("body").innerText({ timeout: 3000 });
    return /2단계|새로운 기기|기기 인증|앱에서.*확인|휴대폰.*인증|인증번호|보안문자|카카오톡.*인증/i.test(
      body,
    );
  } catch {
    return false;
  }
}

export type WaitForAuthOptions = {
  /** headless 서버에서도 푸시·앱 승인 대기 허용 */
  allowHeadless?: boolean;
  /** 이 호출에서만 쓸 최대 대기(ms) */
  maxWaitMs?: number;
};

/**
 * 2단계 인증·기기 승인 대기.
 * Vercel headless에서도 휴대폰 앱 승인을 기다릴 수 있음.
 */
export async function waitForManualAuth(
  page: Page,
  isLoggedIn: () => Promise<boolean>,
  platformName: string,
  options: WaitForAuthOptions = {},
): Promise<boolean> {
  const waitMs = options.maxWaitMs ?? config.auth2faWaitMs;
  if (waitMs <= 0) return false;

  const allowHeadless = options.allowHeadless ?? config.isVercel;
  if (config.authLoginHeadless && !allowHeadless) {
    return false;
  }

  const screen = await describeLoginPage(page);
  const localChrome = !config.isVercel && !config.authLoginHeadless;
  await reportConnectProgress(
    localChrome
      ? `${platformName} ${screen} — 열린 Chrome 창에서 캡차·인증을 직접 완료해 주세요.`
      : `${platformName} ${screen} — 휴대폰 알림·앱 승인, 또는 원격 미리보기로 입력해 주세요. (캡차는 로컬 Chrome 직접 로그인 권장)`,
  );
  await captureConnectScreenshot(page, "인증 화면을 확인하는 중…");

  console.log(
    `\n[${platformName}] 추가 인증 대기 (${screen}, 최대 ${Math.round(waitMs / 1000)}초)\n`,
  );

  const start = Date.now();
  let lastLogAt = 0;
  let lastShotAt = 0;

  while (Date.now() - start < waitMs) {
    if (await isLoggedIn()) {
      await reportConnectProgress(`${platformName} 인증이 완료되었습니다.`);
      console.log(`[${platformName}] 추가 인증 완료 — 로그인 성공`);
      return true;
    }

    const elapsed = Date.now() - start;
    if (elapsed - lastLogAt >= 8000) {
      lastLogAt = elapsed;
      const remaining = Math.max(0, Math.ceil((waitMs - elapsed) / 1000));
      const current = await describeLoginPage(page);
      await reportConnectProgress(
        `${platformName} 인증 대기 중… (${current}, ${remaining}초 남음)`,
      );
    }

    if (elapsed - lastShotAt >= 20_000) {
      lastShotAt = elapsed;
      await captureConnectScreenshot(page, "인증 진행을 확인하는 중…");
    }

    await humanPause(2000);
  }

  await reportConnectProgress(
    `${platformName} 인증 대기 시간이 초과되었습니다. 휴대폰에서 승인했는지 확인한 뒤 다시 시도해 주세요.`,
  );
  return false;
}

/** 로그인 완료까지 폴링 (2단계 인증 자동 감지·대기 포함) */
export async function waitForLoginComplete(
  page: Page,
  isLoggedIn: () => Promise<boolean>,
  platformName: string,
  options: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<boolean> {
  const maxWaitMs = options.maxWaitMs ?? config.auth2faWaitMs;
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const start = Date.now();
  let authWaitStarted = false;
  let lastProgressAt = 0;

  while (Date.now() - start < maxWaitMs) {
    if (await isLoggedIn()) {
      await reportConnectProgress(`${platformName} 로그인에 성공했습니다.`);
      return true;
    }

    if (await isManualAuthScreen(page)) {
      if (!authWaitStarted) {
        authWaitStarted = true;
        const remaining = Math.max(30_000, maxWaitMs - (Date.now() - start));
        const completed = await waitForManualAuth(page, isLoggedIn, platformName, {
          allowHeadless: true,
          maxWaitMs: remaining,
        });
        if (completed) return true;
        return false;
      }
    } else if (Date.now() - lastProgressAt >= 10_000) {
      lastProgressAt = Date.now();
      const screen = await describeLoginPage(page);
      await reportConnectProgress(`${platformName} ${screen}…`);
      if (config.isVercel) {
        await captureConnectScreenshot(page);
      }
    }

    await humanPause(pollIntervalMs);
  }

  return false;
}
