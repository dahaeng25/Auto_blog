import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BrowserContext } from "playwright";
import { config } from "../../config/index.js";
import {
  getEnabledPlatforms,
  PLATFORMS,
  type Platform,
} from "../../config/index.js";
import { createBrowserSession } from "./browser-factory.js";
import {
  isGoogleLoggedIn,
  isNaverLoggedIn,
  isTistoryLoggedIn,
} from "./login-check.js";
import { saveSession } from "./session-manager.js";

/** 터미널에서 Enter 입력을 기다립니다. */
async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  await rl.question(message);
  rl.close();
}

const LOGIN_CHECKERS: Record<
  Platform,
  (ctx: BrowserContext) => Promise<boolean>
> = {
  naver: isNaverLoggedIn,
  tistory: isTistoryLoggedIn,
  google: isGoogleLoggedIn,
};

function blogIdForPlatform(platform: Platform): string {
  switch (platform) {
    case "naver":
      return config.naverBlogId;
    case "tistory":
      return config.tistoryBlogName;
    case "google":
      return config.bloggerBlogId;
  }
}

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

  await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const blogId = blogIdForPlatform(platform);
  if (blogId) {
    const writeUrl = PLATFORMS[platform].postWriteUrl(blogId);
    console.log(`   글쓰기 페이지 방문: ${writeUrl}`);
    await page.goto(writeUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
  }

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
 * headless:false 브라우저로 활성화된 플랫폼 순서로 수동 로그인 후
 * storage_state JSON 파일을 생성합니다.
 */
export async function runAuthSetup(): Promise<void> {
  const platforms = getEnabledPlatforms();
  if (platforms.length === 0) {
    throw new Error(
      "인증 설정할 플랫폼이 없습니다. .env에서 ENABLE_*_PUBLISH 중 하나 이상을 true로 설정하세요.",
    );
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   블로그 오케스트레이터 — 인증 설정      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(
    `\n대상 플랫폼: ${platforms.map((p) => PLATFORMS[p].name).join(", ")}\n`,
  );

  const session = await createBrowserSession({ headless: false });

  try {
    for (const platform of platforms) {
      await setupPlatformAuth(platform, session.context);
    }

    console.log("\n🎉 모든 플랫폼 인증이 완료되었습니다.");
    for (const platform of platforms) {
      console.log(`   auth/${platform}_state.json`);
    }
  } finally {
    await session.close();
  }
}
