import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BrowserContext, Page } from "playwright";
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
import {
  isWriteEditorVisible,
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
  primaryWriteUrl,
} from "./write-page-nav.js";

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
      return normalizeNaverBlogId(config.naverBlogId);
    case "tistory":
      return normalizeTistoryBlogName(config.tistoryBlogName);
    case "google":
      return config.bloggerBlogId;
  }
}

async function tryOpenWritePage(
  page: Page,
  platform: Platform,
  blogId: string,
): Promise<boolean> {
  if (!blogId) {
    console.warn(
      `   ⚠ ${platform === "naver" ? "NAVER_BLOG_ID" : "TISTORY_BLOG_NAME"} 미설정 — 글쓰기 페이지 건너뜀`,
    );
    return false;
  }

  console.log(`   블로그 ID: ${blogId}`);
  console.log(`   글쓰기 URL: ${primaryWriteUrl(platform, blogId)}`);

  try {
    await navigateToWritePage(page, platform, blogId);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`\n   ⚠ 자동 이동 실패:\n   ${msg.replace(/\n/g, "\n   ")}\n`);
    return false;
  }
}

/**
 * 단일 플랫폼에 대해 수동 로그인 → 세션 저장 플로우를 실행합니다.
 */
async function setupPlatformAuth(
  platform: Platform,
  context: BrowserContext,
): Promise<void> {
  const { name, loginUrl } = PLATFORMS[platform];
  const page = await context.newPage();
  const blogId = blogIdForPlatform(platform);

  console.log(`\n━━━ ${name} 로그인 ━━━`);
  console.log(`1. 브라우저에서 로그인 페이지로 이동합니다.`);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  console.log(`2. 브라우저에서 직접 로그인을 완료하세요. (캡차/2단계 인증 포함)`);
  await waitForEnter(`3. 로그인이 끝나면 Enter를 누르세요... `);

  let writeOk = false;
  if (blogId) {
    writeOk = await tryOpenWritePage(page, platform, blogId);

    if (!writeOk) {
      const manualUrl =
        platform === "naver"
          ? `https://blog.naver.com/${blogId}?Redirect=Write`
          : `https://${blogId}.tistory.com/manage/newpost`;
      console.log(
        `\n4. 브라우저에서 직접 글쓰기 페이지를 열어 주세요.\n` +
          `   ${manualUrl}\n`,
      );
      await waitForEnter(
        `   글쓰기 화면이 보이면 Enter를 누르세요... `,
      );
      writeOk = await isWriteEditorVisible(page, platform);
    }
  }

  const isLoggedIn = await LOGIN_CHECKERS[platform](context);
  if (!isLoggedIn) {
    throw new Error(
      `[${name}] 로그인이 확인되지 않았습니다. 다시 시도해 주세요.`,
    );
  }

  if (blogId && !writeOk) {
    console.warn(
      `   ⚠ 글쓰기 에디터는 확인되지 않았지만 로그인 세션은 저장합니다.\n` +
        `   발행 전 npm run auth:verify 로 다시 확인하세요.`,
    );
  } else if (writeOk) {
    console.log(`   ✅ 글쓰기 화면 접근 확인`);
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

  if (config.naverBlogId) {
    console.log(
      `네이버 블로그 ID: ${normalizeNaverBlogId(config.naverBlogId)}`,
    );
  }
  if (config.tistoryBlogName) {
    console.log(
      `티스토리 블로그: ${normalizeTistoryBlogName(config.tistoryBlogName)}`,
    );
  }
  console.log("");

  const session = await createBrowserSession({ headless: false });

  try {
    for (const platform of platforms) {
      await setupPlatformAuth(platform, session.context);
    }

    console.log("\n🎉 모든 플랫폼 인증이 완료되었습니다.");
    for (const platform of platforms) {
      console.log(`   auth/${platform}_state.json`);
    }
    console.log("\n다음: npm run auth:verify");
  } finally {
    await session.close();
  }
}
