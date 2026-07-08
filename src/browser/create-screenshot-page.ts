import type { Browser, Page } from "playwright-core";
import { isServerless } from "./is-serverless.js";

export interface ScreenshotPageOptions {
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
}

/**
 * Sparticuz single-process Chromium은 isolated context 생성 시 종료되는 경우가 있어
 * 서버리스에서는 default context + browser.newPage()를 사용합니다.
 */
export async function createScreenshotPage(
  browser: Browser,
  options: ScreenshotPageOptions,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (isServerless()) {
    const page = await browser.newPage();
    await page.setViewportSize(options.viewport);
    return {
      page,
      close: async () => {
        await page.close().catch(() => {});
      },
    };
  }

  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
  });
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}
