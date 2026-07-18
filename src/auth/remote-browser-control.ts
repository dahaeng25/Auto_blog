import type { Page } from "playwright";
import type { Platform } from "../../config/platforms.js";
import { connectInputStore } from "../api/connect-input-store.js";
import { connectJobStore } from "../api/connect-job-store.js";
import { humanPause } from "../publishing/utils/human-input.js";
import { reportConnectProgress } from "./connect-progress.js";

const FRAME_INTERVAL_MS = 1200;
const INPUT_POLL_MS = 350;

async function applyInput(
  page: Page,
  action: Awaited<ReturnType<typeof connectInputStore.drain>>[number],
): Promise<void> {
  if (action.type === "click") {
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    const x = Math.max(0, Math.min(1, action.x)) * viewport.width;
    const y = Math.max(0, Math.min(1, action.y)) * viewport.height;
    await page.mouse.click(x, y);
    return;
  }

  if (action.type === "type") {
    if (/^[\x20-\x7E\n\r\t]*$/.test(action.text)) {
      await page.keyboard.type(action.text, { delay: 35 });
    } else {
      await page.keyboard.insertText(action.text);
    }
    return;
  }

  await page.keyboard.press(action.key);
}

/**
 * 서버리스 브라우저를 DB 입력 큐와 연결합니다.
 * 별도 함수 인스턴스에서 받은 입력도 현재 실행 중인 page가 소비할 수 있습니다.
 */
export async function startRemoteBrowserControl(
  platform: Platform,
  page: Page,
): Promise<() => Promise<void>> {
  let stopped = false;
  let lastFrameAt = 0;

  await connectInputStore.clear(platform);
  await reportConnectProgress(
    "추가 인증 화면을 직접 조작할 수 있습니다. 화면을 눌러 조작하세요.",
  );

  const loop = (async () => {
    while (!stopped && !page.isClosed()) {
      try {
        const actions = await connectInputStore.drain(platform);
        for (const action of actions) {
          await applyInput(page, action);
        }

        if (Date.now() - lastFrameAt >= FRAME_INTERVAL_MS) {
          lastFrameAt = Date.now();
          const shot = await page.screenshot({ type: "jpeg", quality: 65 });
          await connectJobStore.updateInteractiveFrame(platform, shot);
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
