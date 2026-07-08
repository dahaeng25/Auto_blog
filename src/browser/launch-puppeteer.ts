import path from "node:path";
import type { Browser } from "puppeteer-core";

const SERVERLESS_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

function appendLdLibraryPath(...dirs: string[]): void {
  const existing = process.env.LD_LIBRARY_PATH?.split(":").filter(Boolean) ?? [];
  process.env.LD_LIBRARY_PATH = [...new Set([...dirs, ...existing])].join(":");
}

/**
 * Vercel 서버리스 — puppeteer-core + @sparticuz/chromium (Playwright보다 안정적).
 */
export async function launchPuppeteer(): Promise<Browser> {
  if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME) {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
  }

  const puppeteer = await import("puppeteer-core");
  const chromiumPkg = (await import("@sparticuz/chromium")).default;
  chromiumPkg.setGraphicsMode = false;

  const executablePath = await chromiumPkg.executablePath();
  appendLdLibraryPath(
    path.dirname(executablePath),
    "/tmp/al2023/lib",
    "/tmp/al2/lib",
  );

  return puppeteer.default.launch({
    args: [...chromiumPkg.args, ...SERVERLESS_ARGS],
    executablePath,
    headless: true,
  });
}
