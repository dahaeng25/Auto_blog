import type { Locator, Page } from "playwright";

/** 115~140ms 사이 랜덤 딜레이 (인간 타이핑 모사) */
export function randomTypingDelay(): number {
  return 115 + Math.floor(Math.random() * 26);
}

export async function humanPause(ms?: number): Promise<void> {
  const delay = ms ?? randomTypingDelay();
  await new Promise((r) => setTimeout(r, delay));
}

/**
 * 베지어 곡선 근사 — ghost-cursor 대신 Playwright steps로 부드러운 이동
 */
export async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
): Promise<void> {
  const steps = 20 + Math.floor(Math.random() * 15);
  await page.mouse.move(targetX, targetY, { steps });
  await humanPause(80);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 시간 초과 (${Math.round(ms / 1000)}초)`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 엘리먼트 중앙으로 이동 후 클릭 */
export async function humanClick(locator: Locator): Promise<void> {
  const page = locator.page();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("클릭 대상 엘리먼트의 boundingBox를 찾을 수 없습니다.");

  const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
  const y = box.y + box.height / 2 + (Math.random() * 4 - 2);

  await humanMouseMove(page, x, y);
  await page.mouse.click(x, y, { delay: randomTypingDelay() });
  await humanPause(150);
}

/**
 * humanClick이 서버리스·헤드리스에서 무한 대기하는 경우를 막음.
 * 실패 시 Playwright 기본 click / JS click 으로 폴백.
 */
export async function humanClickSafe(
  locator: Locator,
  timeoutMs = 12_000,
): Promise<"human" | "locator" | "evaluate"> {
  try {
    await withTimeout(humanClick(locator), timeoutMs, "인간형 클릭");
    return "human";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[humanClickSafe] 인간형 클릭 실패 → 폴백: ${reason}`);
  }

  try {
    await locator.click({ timeout: Math.min(8000, timeoutMs), delay: 80 });
    await humanPause(150);
    return "locator";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[humanClickSafe] locator.click 실패 → JS click: ${reason}`);
  }

  await locator.evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
  });
  await humanPause(150);
  return "evaluate";
}

/**
 * 짧은 텍스트(제목 등)에만 사용 — HTML 본문에는 사용하지 마세요.
 */
export async function humanType(
  locator: Locator,
  text: string,
): Promise<void> {
  await humanClick(locator);
  await locator.pressSequentially(text, { delay: randomTypingDelay() });
}
