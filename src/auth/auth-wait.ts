import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { humanPause } from "../publishing/utils/human-input.js";

/** paste 차단 우회 — 네이버·카카오 공통 */
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
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
  );
  await humanPause(300);
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
    'input[name="otp"]',
    'input[placeholder*="인증"]',
    'text=2단계',
    'text=본인확인',
    'text=기기 인증',
    'text=새로운 기기',
    'text=휴대폰 인증',
    "#phoneNumber",
    ".box_verify",
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
  return (
    /two.?step|otp|verify|device|challenge|captcha/i.test(url) &&
    !/nid\.naver\.com\/nidlogin\.login$/i.test(url)
  );
}

/**
 * 2단계 인증 등 수동 완료 대기.
 * headless=false 일 때만 동작하며, 완료되면 true. 타임아웃 시 false.
 */
export async function waitForManualAuth(
  page: Page,
  isLoggedIn: () => Promise<boolean>,
  platformName: string,
): Promise<boolean> {
  if (config.authLoginHeadless) {
    return false;
  }

  const waitMs = config.auth2faWaitMs;
  if (waitMs <= 0) {
    return false;
  }

  console.log(`\n[${platformName}] 캡차/2단계 인증이 필요합니다.`);
  console.log(
    `  → 열린 브라우저 창에서 인증을 완료해 주세요. (최대 ${Math.round(waitMs / 1000)}초 대기)\n`,
  );

  const start = Date.now();
  while (Date.now() - start < waitMs) {
    if (await isLoggedIn()) {
      console.log(`[${platformName}] 수동 인증 완료 — 로그인 성공`);
      return true;
    }

    await humanPause(1500);
  }

  return false;
}
