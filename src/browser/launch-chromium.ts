import path from "node:path";
import type { Browser, LaunchOptions } from "playwright-core";
import { isServerless } from "./is-serverless.js";

const SERVERLESS_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

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

function appendLdLibraryPath(...dirs: string[]): void {
  const existing = process.env.LD_LIBRARY_PATH?.split(":").filter(Boolean) ?? [];
  process.env.LD_LIBRARY_PATH = [...new Set([...dirs, ...existing])].join(":");
}

/**
 * 로컬: playwright-extra + stealth / Vercel: playwright-core + @sparticuz/chromium
 */
export async function launchChromium(
  options: LaunchOptions = {},
): Promise<Browser> {
  if (isServerless()) {
    if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
    }

    const { chromium } = await import("playwright-core");
    const chromiumPkg = (await import("@sparticuz/chromium")).default;
    chromiumPkg.setGraphicsMode = false;

    const executablePath = await chromiumPkg.executablePath();
    appendLdLibraryPath(
      path.dirname(executablePath),
      "/tmp/al2023/lib",
      "/tmp/al2/lib",
    );

    return chromium.launch({
      args: [...chromiumPkg.args, ...SERVERLESS_ARGS],
      executablePath,
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
