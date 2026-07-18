import fs from "node:fs";
import path from "node:path";
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "playwright-core";
import { chromium as standardChromium } from "playwright";
import { config } from "../../config/index.js";
import { launchChromium } from "../browser/launch-chromium.js";
import type { Platform } from "../../config/platforms.js";
import { requireUserId } from "./user-context.js";

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
    const context = await browser.newContext({
      ...DEFAULT_CONTEXT_OPTIONS,
      ...(storageStatePath ? { storageState: storageStatePath } : {}),
    });
    await context.addInitScript(STEALTH_INIT_SCRIPT);
    const page = await context.newPage();

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

/**
 * 로컬 수동 인증 전용: 설치된 Chrome의 보이는 창과 사용자별 영구 프로필 사용.
 * 자동화 은폐 스크립트는 주입하지 않고 사용자가 실제 DOM을 직접 조작합니다.
 */
export async function createManualChromeSession(
  platform: Platform,
): Promise<BrowserSession> {
  if (isServerless()) {
    throw new Error("서버리스 환경에서는 로컬 Chrome 창을 열 수 없습니다.");
  }

  const userDataDir = path.join(
    config.dataDir,
    "chrome-profiles",
    String(requireUserId()),
    platform,
  );
  fs.mkdirSync(userDataDir, { recursive: true });

  let context: BrowserContext | null = null;
  let lastError: unknown;
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      context = await standardChromium.launchPersistentContext(userDataDir, {
        ...DEFAULT_CONTEXT_OPTIONS,
        channel,
        headless: false,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!context) {
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `설치된 Chrome 또는 Edge를 열 수 없습니다. 브라우저 설치 상태를 확인해 주세요. (${reason})`,
    );
  }

  const page = context.pages()[0] ?? (await context.newPage());
  const browser = context.browser();
  if (!browser) {
    await context.close();
    throw new Error("Chrome 브라우저 컨텍스트를 만들 수 없습니다.");
  }

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
    },
  };
}
