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

let localChromiumPromise: ReturnType<typeof importPlaywrightExtra> | null = null;

async function importPlaywrightExtra() {
  const { chromium } = await import("playwright-extra");
  const StealthPlugin = (await import("puppeteer-extra-plugin-stealth"))
    .default;
  chromium.use(StealthPlugin());
  return chromium;
}

/** 로컬 환경에서 playwright-extra + stealth 플러그인 적용 */
async function getLocalChromium() {
  if (!localChromiumPromise) {
    localChromiumPromise = importPlaywrightExtra();
  }
  return localChromiumPromise;
}

/**
 * 로컬: playwright-extra + stealth / Vercel: playwright-core + @sparticuz/chromium
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

  const chromium = await getLocalChromium();
  return chromium.launch({
    headless: options.headless ?? true,
    args: SERVERLESS_ARGS,
    ...options,
  });
}
