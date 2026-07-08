import type { Page } from "playwright";
import type { Platform } from "../../config/platforms.js";
import { isServerless } from "../browser/is-serverless.js";
import { humanPause } from "../publishing/utils/human-input.js";

function pageSettleMs(): number {
  return isServerless() ? 6000 : 3000;
}

function editorPollAttempts(): number {
  return isServerless() ? 15 : 5;
}

function editorPollIntervalMs(): number {
  return isServerless() ? 2000 : 1000;
}

/** blog.naver.com/xxx 또는 전체 URL → 블로그 ID */
export function normalizeNaverBlogId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/blog\.naver\.com\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\?.*$/, "");
}

/** kanghaeng1345.tistory.com → kanghaeng1345 */
export function normalizeTistoryBlogName(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.tistory\.com.*$/i, "")
    .split("/")[0]
    .split("?")[0];
}

export function getNaverWriteUrls(blogId: string): string[] {
  const id = normalizeNaverBlogId(blogId);
  return [
    `https://blog.naver.com/${id}?Redirect=Write`,
    `https://blog.naver.com/${id}/postwrite`,
    `https://blog.naver.com/PostWrite.naver?blogId=${id}&Redirect=Write&widgetTypeCall=true&directAccess=false`,
  ];
}

export function getTistoryWriteUrls(blogName: string): string[] {
  const name = normalizeTistoryBlogName(blogName);
  return [
    `https://${name}.tistory.com/manage/newpost`,
    `https://www.tistory.com/manage/newpost`,
    `https://${name}.tistory.com/manage/posts/write`,
  ];
}

export function primaryWriteUrl(platform: Platform, blogId: string): string {
  if (platform === "naver") {
    return getNaverWriteUrls(blogId)[0]!;
  }
  if (platform === "tistory") {
    return getTistoryWriteUrls(blogId)[0]!;
  }
  return "";
}

/** 권한 없음·404 안내 페이지 */
export async function isPermissionDeniedPage(page: Page): Promise<boolean> {
  try {
    const body = await page.locator("body").innerText({ timeout: 5000 });
    return (
      /권한이 없거나\s*존재하지 않는 페이지/.test(body) ||
      /접근\s*권한이\s*없/.test(body) ||
      /페이지를\s*찾을\s*수\s*없/.test(body)
    );
  } catch {
    return false;
  }
}

async function isNaverEditorVisible(page: Page): Promise<boolean> {
  if (/nidlogin|nid\.naver\.com\/nidlogin/i.test(page.url())) {
    return false;
  }
  if (await isPermissionDeniedPage(page)) return false;

  const iframe = page.locator("iframe#mainFrame").first();
  if ((await iframe.count()) === 0) return false;

  const handle = await iframe.elementHandle();
  const frame = handle ? await handle.contentFrame() : null;
  if (!frame) return false;

  const title = frame.locator(".se-documentTitle, .se-title-text").first();
  if ((await title.count()) === 0) return false;

  try {
    return await title.isVisible();
  } catch {
    return true;
  }
}

async function isTistoryEditorVisible(page: Page): Promise<boolean> {
  const url = page.url();
  if (/accounts\.kakao\.com|tistory\.com\/auth\/login|kauth\.kakao\.com/i.test(url)) {
    return false;
  }
  if (await isPermissionDeniedPage(page)) return false;

  const title = page.locator("#post-title-inp, input[name='title']").first();
  return (await title.count()) > 0 && (await title.isVisible());
}

export async function isWriteEditorVisible(
  page: Page,
  platform: Platform,
): Promise<boolean> {
  if (platform === "naver") return isNaverEditorVisible(page);
  if (platform === "tistory") return isTistoryEditorVisible(page);
  return false;
}

/** 서버리스 Chromium은 에디터 DOM 로딩이 느려 폴링으로 대기합니다. */
async function waitForWriteEditor(
  page: Page,
  platform: Platform,
): Promise<boolean> {
  for (let attempt = 0; attempt < editorPollAttempts(); attempt++) {
    if (await isWriteEditorVisible(page, platform)) {
      return true;
    }
    await humanPause(editorPollIntervalMs());
  }
  return false;
}

/** 저장된 세션 쿠키를 활성화하기 위해 플랫폼 홈을 먼저 방문합니다. */
async function warmPlatformSession(
  page: Page,
  platform: Platform,
  blogId: string,
): Promise<void> {
  if (!isServerless()) return;

  const normalizedId =
    platform === "naver"
      ? normalizeNaverBlogId(blogId)
      : normalizeTistoryBlogName(blogId);

  const warmUrls =
    platform === "naver"
      ? [
          "https://www.naver.com",
          `https://blog.naver.com/${normalizedId}`,
        ]
      : platform === "tistory"
        ? [
            "https://www.tistory.com",
            `https://${normalizedId}.tistory.com/manage/posts`,
          ]
        : [];

  for (const url of warmUrls) {
    console.log(`[글쓰기] 세션 워밍업: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2000);
  }
}

/**
 * 글쓰기 URL 후보를 순서대로 시도해 에디터가 열리는 주소를 반환합니다.
 */
export async function navigateToWritePage(
  page: Page,
  platform: Platform,
  blogId: string,
): Promise<string> {
  const urls =
    platform === "naver"
      ? getNaverWriteUrls(blogId)
      : platform === "tistory"
        ? getTistoryWriteUrls(blogId)
        : [];

  if (urls.length === 0) {
    throw new Error("지원하지 않는 플랫폼입니다.");
  }

  const normalizedId =
    platform === "naver"
      ? normalizeNaverBlogId(blogId)
      : normalizeTistoryBlogName(blogId);

  await warmPlatformSession(page, platform, blogId);

  for (const url of urls) {
    console.log(`[글쓰기] 이동 시도: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(pageSettleMs());

    if (await isPermissionDeniedPage(page)) {
      console.warn(`[글쓰기] 권한 없음 페이지 — 다음 URL 시도`);
      continue;
    }

    if (await waitForWriteEditor(page, platform)) {
      console.log(`[글쓰기] 에디터 확인: ${url}`);
      return url;
    }
  }

  throw new Error(
    platform === "naver"
      ? `네이버 글쓰기 페이지에 접근할 수 없습니다.\n` +
        `  • NAVER_BLOG_ID="${normalizedId}" 가 본인 블로그 주소와 일치하는지 확인하세요.\n` +
        `  • 블로그 주소 예: https://blog.naver.com/${normalizedId}\n` +
        `  • 로그인한 네이버 계정이 해당 블로그의 작성 권한이 있는지 확인하세요.`
      : `티스토리 글쓰기 페이지에 접근할 수 없습니다.\n` +
        `  • TISTORY_BLOG_NAME="${normalizedId}" 가 본인 블로그 서브도메인과 일치하는지 확인하세요.\n` +
        `  • 블로그 주소 예: https://${normalizedId}.tistory.com\n` +
        `  • 로그인한 카카오 계정이 해당 블로그 소유자인지 확인하세요.`,
  );
}
