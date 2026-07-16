import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { createBrowserSession, getSessionPage } from "./browser-factory.js";
import {
  assertEditorAccessible,
  hasLoginCookies,
  sessionExpiredMessage,
} from "./login-check.js";
import { requireSession } from "./session-manager.js";
import { humanPause } from "../publishing/utils/human-input.js";
import {
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
} from "./write-page-nav.js";

export interface SessionVerifyResult {
  platform: Platform;
  valid: boolean;
  detail: string;
}

async function verifyNaverEditor(page: Page): Promise<string | null> {
  const blogId = config.naverBlogId;
  if (!blogId) return "NAVER_BLOG_ID 미설정";

  const writeUrl = await navigateToWritePage(
    page,
    "naver",
    normalizeNaverBlogId(blogId),
  );
  console.log(`[검증] 네이버 글쓰기: ${writeUrl}`);
  await humanPause(1000);

  await assertEditorAccessible(page, "naver");

  const iframe = page.locator("iframe#mainFrame").first();
  if ((await iframe.count()) === 0) {
    return "에디터 iframe(#mainFrame) 없음 — 세션 만료 가능";
  }

  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) return "에디터 iframe 로드 실패";

  for (let i = 0; i < 20; i++) {
    const title = frame.locator(".se-documentTitle").first();
    if ((await title.count()) > 0 && (await title.isVisible())) {
      return null;
    }
    await humanPause(500);
  }

  return "글쓰기 화면을 열 수 없습니다. 「계정 연결」에서 다시 로그인해 주세요.";
}

async function verifyTistoryEditor(page: Page): Promise<string | null> {
  const blogName = config.tistoryBlogName;
  if (!blogName) return "TISTORY_BLOG_NAME 미설정";

  const writeUrl = await navigateToWritePage(
    page,
    "tistory",
    normalizeTistoryBlogName(blogName),
  );
  console.log(`[검증] 티스토리 글쓰기: ${writeUrl}`);
  await humanPause(1000);

  await assertEditorAccessible(page, "tistory");

  const title = page.locator("#post-title-inp, input[name='title']").first();
  for (let i = 0; i < 20; i++) {
    if ((await title.count()) > 0 && (await title.isVisible())) {
      return null;
    }
    await humanPause(500);
  }

  return "글쓰기 화면을 열 수 없습니다. 「계정 연결」에서 다시 로그인해 주세요.";
}

/** 단일 플랫폼 세션 검증 (글쓰기 페이지까지 확인) */
export async function verifyPlatformSession(
  platform: Platform,
  headless = true,
): Promise<SessionVerifyResult> {
  let statePath: string;
  try {
    statePath = await requireSession(platform);
  } catch (e) {
    return {
      platform,
      valid: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const session = await createBrowserSession({
    headless,
    storageStatePath: statePath,
  });

  const page = await getSessionPage(session);

  try {
    const hasCookies = await hasLoginCookies(session.context, platform);
    if (!hasCookies) {
      return {
        platform,
        valid: false,
        detail: sessionExpiredMessage(platform),
      };
    }

    const editorError =
      platform === "naver"
        ? await verifyNaverEditor(page)
        : await verifyTistoryEditor(page);

    if (editorError) {
      return { platform, valid: false, detail: editorError };
    }

    return {
      platform,
      valid: true,
      detail: "글쓰기 화면 접근 OK",
    };
  } finally {
    await page.close();
    await session.close();
  }
}

/** 네이버·티스토리 세션 일괄 검증 */
export async function verifyAllSessions(
  headless = true,
): Promise<SessionVerifyResult[]> {
  const results: SessionVerifyResult[] = [];

  if (config.naverBlogId) {
    results.push(await verifyPlatformSession("naver", headless));
  }
  if (config.tistoryBlogName) {
    results.push(await verifyPlatformSession("tistory", headless));
  }

  return results;
}
