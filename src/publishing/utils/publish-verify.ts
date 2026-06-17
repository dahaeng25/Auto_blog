import type { Page } from "playwright";
import type { Platform } from "../../../config/platforms.js";
import { humanPause } from "./human-input.js";

/** 아직 에디터(글쓰기) 페이지인지 확인 */
export function isEditorUrl(url: string, platform: Platform): boolean {
  if (platform === "naver") {
    return /postwrite/i.test(url);
  }
  if (platform === "tistory") {
    return /manage\/newpost|manage\/posts\/write|\/manage\/newpost/i.test(url);
  }
  return false;
}

/**
 * 발행 후 URL이 에디터에서 벗어날 때까지 대기합니다.
 * postwrite / newpost URL이면 발행 미완료로 판단합니다.
 */
export async function waitForPublishedUrl(
  page: Page,
  platform: Platform,
  timeoutMs = 45_000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const url = page.url();

    if (!isEditorUrl(url, platform)) {
      console.log(`[${platform}] 발행 완료 URL: ${url}`);
      return url;
    }

    await humanPause(1000);
  }

  throw new Error(
    `[${platform}] 발행이 완료되지 않았습니다. ` +
      `현재 URL: ${page.url()} — 발행 확인 버튼을 찾지 못했을 수 있습니다.`,
  );
}
