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
 * 짧은 텍스트(제목 등)에만 사용 — HTML 본문에는 사용하지 마세요.
 */
export async function humanType(
  locator: Locator,
  text: string,
): Promise<void> {
  await humanClick(locator);
  await locator.pressSequentially(text, { delay: randomTypingDelay() });
}
