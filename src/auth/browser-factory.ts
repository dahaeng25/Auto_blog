import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
} from "playwright";

/** Playwright 기본 launch 옵션 */
const DEFAULT_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
};

/** 한국어 로케일 및 일반적인 데스크톱 뷰포트 */
const DEFAULT_CONTEXT_OPTIONS: BrowserContextOptions = {
  viewport: { width: 1440, height: 900 },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

/**
 * 봇 탐지 완화용 init script.
 * puppeteer-extra-plugin-stealth 대신 Playwright 네이티브 방식 사용.
 */
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
  close: () => Promise<void>;
}

/**
 * 스텔스 설정이 적용된 Chromium 브라우저와 컨텍스트를 생성합니다.
 * storageStatePath가 있으면 저장된 쿠키/세션을 주입합니다.
 */
export async function createBrowserSession(
  options: CreateBrowserOptions = {},
): Promise<BrowserSession> {
  const { headless = true, storageStatePath } = options;

  const browser = await chromium.launch({
    ...DEFAULT_LAUNCH_OPTIONS,
    headless,
  });

  const context = await browser.newContext({
    ...DEFAULT_CONTEXT_OPTIONS,
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });

  await context.addInitScript(STEALTH_INIT_SCRIPT);

  return {
    browser,
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
