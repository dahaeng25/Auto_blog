import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { createBrowserSession } from "./browser-factory.js";
import {
  assertEditorAccessible,
  hasLoginCookies,
  sessionExpiredMessage,
} from "./login-check.js";
import { getStateFilePath, requireSession } from "./session-manager.js";
import { humanPause } from "../publishing/utils/human-input.js";

export interface SessionVerifyResult {
  platform: Platform;
  valid: boolean;
  detail: string;
}

async function verifyNaverEditor(page: Page): Promise<string | null> {
  const blogId = config.naverBlogId;
  if (!blogId) return "NAVER_BLOG_ID 미설정";

  const writeUrl = PLATFORMS.naver.postWriteUrl(blogId);
  await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await humanPause(3000);

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

  return "제목 입력란(.se-documentTitle) 없음 — npm run auth:setup 필요";
}

async function verifyTistoryEditor(page: Page): Promise<string | null> {
  const blogName = config.tistoryBlogName;
  if (!blogName) return "TISTORY_BLOG_NAME 미설정";

  const writeUrl = PLATFORMS.tistory.postWriteUrl(blogName);
  await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await humanPause(3000);

  await assertEditorAccessible(page, "tistory");

  const title = page.locator("#post-title-inp, input[name='title']").first();
  for (let i = 0; i < 20; i++) {
    if ((await title.count()) > 0 && (await title.isVisible())) {
      return null;
    }
    await humanPause(500);
  }

  return "제목 입력란(#post-title-inp) 없음 — npm run auth:setup 필요";
}

/** 단일 플랫폼 세션 검증 (글쓰기 페이지까지 확인) */
export async function verifyPlatformSession(
  platform: Platform,
  headless = true,
): Promise<SessionVerifyResult> {
  try {
    await requireSession(platform);
  } catch (e) {
    return {
      platform,
      valid: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const statePath = getStateFilePath(platform);
  const session = await createBrowserSession({
    headless,
    storageStatePath: statePath,
  });

  const page = await session.context.newPage();

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
