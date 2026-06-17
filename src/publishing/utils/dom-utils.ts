import type { Frame, Locator, Page } from "playwright";

export type PageOrFrame = Page | Frame;

/** 쉼표 구분 셀렉터를 배열로 분리 */
export function splitSelectors(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 여러 context에서 첫 번째 visible locator 반환 */
export async function findFirstVisible(
  contexts: PageOrFrame[],
  selectors: string[],
): Promise<{ locator: Locator; context: PageOrFrame } | null> {
  for (const ctx of contexts) {
    for (const sel of selectors) {
      const locator = ctx.locator(sel).first();
      try {
        if ((await locator.count()) > 0 && (await locator.isVisible())) {
          return { locator, context: ctx };
        }
      } catch {
        // 다음 셀렉터
      }
    }
  }
  return null;
}

/** 본문 길이에 비례한 에디터 안정화 대기 (ms) */
export function editorSettleDelay(htmlLength: number): number {
  return Math.min(5000, 800 + Math.floor(htmlLength / 8));
}
