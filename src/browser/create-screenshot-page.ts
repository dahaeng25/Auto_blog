import type { Browser, Page } from "playwright-core";

export interface ScreenshotPageOptions {
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
}

function useServerlessChromium(): boolean {
  return Boolean(process.env.VERCEL) || process.env.USE_SERVERLESS_CHROMIUM === "true";
}

/**
 * Sparticuz single-process Chromium은 isolated context 생성 시 종료되는 경우가 있어
 * 서버리스에서는 default context + browser.newPage()를 사용합니다.
 */
export async function createScreenshotPage(
  browser: Browser,
  options: ScreenshotPageOptions,
): Promise<{ page: Page; close: () => Promise<void> }> {
  if (useServerlessChromium()) {
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
