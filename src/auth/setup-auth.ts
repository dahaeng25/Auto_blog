import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BrowserContext } from "playwright";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { createBrowserSession } from "./browser-factory.js";
import { saveSession } from "./session-manager.js";

/** 터미널에서 Enter 입력을 기다립니다. */
async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  await rl.question(message);
  rl.close();
}

/**
 * 네이버 로그인 쿠키 존재 여부로 세션 유효성을 간단히 확인합니다.
 */
async function isNaverLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.naver.com");
  return cookies.some(
    (c) => c.name === "NID_AUT" || c.name === "NID_SES",
  );
}

/**
 * 티스토리 세션 쿠키 존재 여부로 로그인을 확인합니다.
 */
async function isTistoryLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://www.tistory.com");
  return cookies.some((c) => c.name === "TSSESSION");
}

const LOGIN_CHECKERS: Record<Platform, (ctx: BrowserContext) => Promise<boolean>> = {
  naver: isNaverLoggedIn,
  tistory: isTistoryLoggedIn,
};

/**
 * 단일 플랫폼에 대해 수동 로그인 → 세션 저장 플로우를 실행합니다.
 */
async function setupPlatformAuth(
  platform: Platform,
  context: BrowserContext,
): Promise<void> {
  const { name, loginUrl, verifyUrl } = PLATFORMS[platform];
  const page = await context.newPage();

  console.log(`\n━━━ ${name} 로그인 ━━━`);
  console.log(`1. 브라우저에서 로그인 페이지로 이동합니다.`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  console.log(`2. 브라우저에서 직접 로그인을 완료하세요. (캡차/2단계 인증 포함)`);
  await waitForEnter(`3. 로그인이 끝나면 Enter를 누르세요... `);

  // verifyUrl로 이동하여 쿠키 갱신
  await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const isLoggedIn = await LOGIN_CHECKERS[platform](context);
  if (!isLoggedIn) {
    throw new Error(
      `[${name}] 로그인이 확인되지 않았습니다. 다시 시도해 주세요.`,
    );
  }

  const savedPath = await saveSession(platform, context);
  console.log(`✅ ${name} 세션 저장 완료: ${savedPath}`);

  await page.close();
}

/**
 * headless:false 브라우저로 네이버·티스토리 순서로 수동 로그인 후
 * storage_state JSON 파일을 생성합니다.
 */
export async function runAuthSetup(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   블로그 오케스트레이터 — 인증 설정      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\n브라우저가 열립니다. 각 플랫폼에 직접 로그인해 주세요.\n");

  const session = await createBrowserSession({ headless: false });

  try {
    await setupPlatformAuth("naver", session.context);
    await setupPlatformAuth("tistory", session.context);

    console.log("\n🎉 모든 플랫폼 인증이 완료되었습니다.");
    console.log("   auth/naver_state.json");
    console.log("   auth/tistory_state.json");
  } finally {
    await session.close();
  }
}
