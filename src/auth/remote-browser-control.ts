import type { Page } from "playwright";
import type { Platform } from "../../config/platforms.js";
import {
  connectInputStore,
  type ConnectInputAction,
} from "../api/connect-input-store.js";
import { connectJobStore } from "../api/connect-job-store.js";
import { humanPause } from "../publishing/utils/human-input.js";
import { reportConnectProgress } from "./connect-progress.js";

const FRAME_INTERVAL_MS = 900;
const INPUT_POLL_MS = 400;

const CHALLENGE_INPUT_SELECTORS = [
  "#captcha",
  'input[name="captcha"]',
  "#captcha_answer",
  'input[id*="captcha"]',
  'input[name*="captcha"]',
  'input[placeholder*="보안"]',
  'input[placeholder*="자동입력"]',
  'input[placeholder*="인증"]',
  'input[name="otp"]',
  "#otp",
  'input[autocomplete="one-time-code"]',
  'input[type="tel"]',
];

const CONFIRM_BUTTON_SELECTORS = [
  'button:has-text("확인")',
  'input[type="submit"][value*="확인"]',
  'a:has-text("확인")',
  'button.btn_confirm',
  'button.btn_primary:has-text("확인")',
  'button[type="submit"]',
  'input[type="submit"]',
];

async function focusChallengeInput(page: Page): Promise<boolean> {
  for (const sel of CHALLENGE_INPUT_SELECTORS) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (!(await loc.isVisible())) continue;
      await loc.click({ timeout: 3_000 });
      await humanPause(80);
      return true;
    } catch {
      // next
    }
  }
  return false;
}

async function clickConfirmButton(page: Page): Promise<boolean> {
  for (const sel of CONFIRM_BUTTON_SELECTORS) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (!(await loc.isVisible())) continue;
      await loc.click({ timeout: 3_000 });
      return true;
    } catch {
      // next
    }
  }
  return false;
}

async function typeIntoPage(page: Page, text: string): Promise<void> {
  const focused = await focusChallengeInput(page);
  if (!focused) {
    console.warn(
      "[remote-browser-control] 캡차 입력칸을 찾지 못함 — 현재 포커스에 타이핑",
    );
  }
  if (/^[\x20-\x7E\n\r\t]*$/.test(text)) {
    await page.keyboard.type(text, { delay: 35 });
  } else {
    await page.keyboard.insertText(text);
  }
}

async function applyConfirm(page: Page, text?: string): Promise<void> {
  if (text) {
    await typeIntoPage(page, text);
    await humanPause(120);
  } else {
    await focusChallengeInput(page);
  }

  const clicked = await clickConfirmButton(page);
  if (!clicked) {
    console.warn(
      "[remote-browser-control] 확인 버튼 미발견 — Enter 폴백",
    );
    await page.keyboard.press("Enter");
  }
}

/** 테스트·내부용: 큐 액션을 Playwright page에 적용 */
export async function applyConnectInput(
  page: Page,
  action: ConnectInputAction,
): Promise<void> {
  if (action.type === "click") {
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    const x = Math.max(0, Math.min(1, action.x)) * viewport.width;
    const y = Math.max(0, Math.min(1, action.y)) * viewport.height;
    await page.mouse.click(x, y);
    return;
  }

  if (action.type === "type") {
    await typeIntoPage(page, action.text);
    return;
  }

  if (action.type === "confirm") {
    await applyConfirm(page, action.text);
    return;
  }

  if (action.key === "Enter") {
    await applyConfirm(page);
    return;
  }

  await page.keyboard.press(action.key);
}

async function pushInteractiveFrame(
  platform: Platform,
  page: Page,
): Promise<void> {
  const shot = await page.screenshot({ type: "jpeg", quality: 65 });
  await connectJobStore.updateInteractiveFrame(platform, shot);
}

/**
 * 서버리스 브라우저를 DB 입력 큐와 연결합니다.
 * phase=input 이 다른 함수 인스턴스여도 Turso 큐를 통해 현재 page가 소비합니다.
 * (로컬 headed Chrome에서는 사용하지 않음 — 사용자가 창에서 직접 입력)
 */
export async function startRemoteBrowserControl(
  platform: Platform,
  page: Page,
): Promise<() => Promise<void>> {
  let stopped = false;
  let lastFrameAt = 0;

  await connectInputStore.clear(platform);
  await connectJobStore.enableInteractive(platform);
  await reportConnectProgress(
    "원격 조작이 활성화되었습니다. 아래 미리보기에 캡차를 입력하거나, 가능하면 로컬 Chrome에서 직접 입력하세요.",
  );

  try {
    await pushInteractiveFrame(platform, page);
    lastFrameAt = Date.now();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[remote-browser-control] 초기 프레임 실패: ${reason}`);
  }

  const loop = (async () => {
    while (!stopped && !page.isClosed()) {
      try {
        const actions = await connectInputStore.drain(platform);
        let applied = false;
        for (const action of actions) {
          console.log(
            `[remote-browser-control] apply ${action.type}` +
              (action.type === "type"
                ? ` len=${action.text.length}`
                : action.type === "confirm" && action.text
                  ? ` len=${action.text.length}`
                  : ""),
          );
          await applyConnectInput(page, action);
          applied = true;
        }

        if (applied || Date.now() - lastFrameAt >= FRAME_INTERVAL_MS) {
          lastFrameAt = Date.now();
          await pushInteractiveFrame(platform, page);
        }
      } catch (error) {
        if (stopped || page.isClosed()) break;
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[remote-browser-control] ${reason}`);
      }
      await humanPause(INPUT_POLL_MS);
    }
  })();

  return async () => {
    stopped = true;
    await loop.catch(() => {});
    await connectInputStore.clear(platform).catch(() => {});
  };
}
