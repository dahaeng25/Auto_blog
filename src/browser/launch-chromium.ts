import type { Browser, LaunchOptions } from "playwright-core";

const SERVERLESS_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

function useServerlessChromium(): boolean {
  return Boolean(process.env.VERCEL) || process.env.USE_SERVERLESS_CHROMIUM === "true";
}

/**
 * 로컬: playwright 풀 패키지 / Vercel: playwright-core + @sparticuz/chromium
 */
export async function launchChromium(
  options: LaunchOptions = {},
): Promise<Browser> {
  if (useServerlessChromium()) {
    const { chromium } = await import("playwright-core");
    const chromiumPkg = (await import("@sparticuz/chromium")).default;

    return chromium.launch({
      args: [...chromiumPkg.args, ...SERVERLESS_ARGS],
      executablePath: await chromiumPkg.executablePath(),
      headless: true,
      ...options,
    });
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: options.headless ?? true,
    args: SERVERLESS_ARGS,
    ...options,
  });
}
