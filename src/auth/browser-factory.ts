import fs from "node:fs/promises";
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";

import { isServerless } from "../browser/is-serverless.js";

const DEFAULT_CONTEXT_OPTIONS: BrowserContextOptions = {
  viewport: { width: 1440, height: 900 },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
`;

export interface CreateBrowserOptions {
  headless?: boolean;
  storageStatePath?: string;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  /** 서버리스: createBrowserSession 시 이미 생성된 첫 페이지. 로컬: null */
  page: Page | null;
  close: () => Promise<void>;
}

/** 서버리스에서는 첫 페이지 재사용 — 두 번째 newPage() 시 Chromium 종료 방지 */
export async function getSessionPage(session: BrowserSession): Promise<Page> {
  if (session.page) return session.page;
  return session.context.newPage();
}

export async function createBrowserSession(
  options: CreateBrowserOptions = {},
): Promise<BrowserSession> {
  const { headless = true, storageStatePath } = options;

  const browser = await launchChromium({ headless });

  if (isServerless()) {
    const page = await browser.newPage();
    const context = page.context();
    await context.addInitScript(STEALTH_INIT_SCRIPT);

    if (storageStatePath) {
      const raw = await fs.readFile(storageStatePath, "utf-8");
      const state = JSON.parse(raw) as {
        cookies?: Parameters<BrowserContext["addCookies"]>[0];
      };
      if (state.cookies?.length) {
        await context.addCookies(state.cookies);
      }
    }

    return {
      browser,
      context,
      page,
      close: async () => {
        await page.close().catch(() => {});
        await browser.close();
      },
    };
  }

  const context = await browser.newContext({
    ...DEFAULT_CONTEXT_OPTIONS,
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });

  await context.addInitScript(STEALTH_INIT_SCRIPT);

  return {
    browser,
    context,
    page: null,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
