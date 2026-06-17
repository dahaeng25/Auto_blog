import type { Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";

const LINK_DIALOG_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.linkDialog);
const LINK_INPUT_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.linkDialogInput);
const LINK_SEARCH_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.linkDialogSearch);
const LINK_CONFIRM_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.linkDialogConfirm);
const LINK_CLOSE_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.linkDialogClose);

/** "링크" 제목 모달이 열려 있는지 탐색 */
export async function detectLinkDialog(
  contexts: PageOrFrame[],
): Promise<{ locator: import("playwright").Locator; context: PageOrFrame } | null> {
  return findFirstVisible(contexts, LINK_DIALOG_SELECTORS);
}

/** 링크 다이얼로그 URL 입력란에 값 채우기 (동일하면 생략) */
export async function fillLinkUrl(
  contexts: PageOrFrame[],
  url: string,
): Promise<boolean> {
  const input = await findFirstVisible(contexts, LINK_INPUT_SELECTORS);
  if (!input) return false;

  try {
    const current = await input.locator.inputValue();
    if (current.trim() !== url.trim()) {
      await input.locator.fill(url);
      await humanPause(300);
    }
    return true;
  } catch {
    return false;
  }
}

/** URL 입력 후 돋보기(검색) 클릭 — 미발견 시 입력란에서 Enter로 대체 */
export async function triggerLinkUrlValidation(
  contexts: PageOrFrame[],
): Promise<boolean> {
  const searchBtn = await findFirstVisible(contexts, LINK_SEARCH_SELECTORS);
  if (searchBtn) {
    await humanClick(searchBtn.locator);
    await humanPause(500);
    return true;
  }

  const input = await findFirstVisible(contexts, LINK_INPUT_SELECTORS);
  if (!input) return false;

  try {
    await input.locator.press("Enter");
    await humanPause(500);
    return true;
  } catch {
    return false;
  }
}

/** 링크 다이얼로그 "확인" 버튼 클릭 */
export async function clickLinkConfirm(
  contexts: PageOrFrame[],
): Promise<boolean> {
  const btn = await findFirstVisible(contexts, LINK_CONFIRM_SELECTORS);
  if (!btn) return false;

  await humanClick(btn.locator);
  await humanPause(500);
  return true;
}

/** 링크 다이얼로그가 열려 있으면 X 또는 Escape로 닫기 */
export async function dismissLinkDialogIfOpen(
  page: Page,
  contexts: PageOrFrame[],
): Promise<boolean> {
  const dialog = await detectLinkDialog(contexts);
  if (!dialog) return false;

  const closeBtn = await findFirstVisible(contexts, LINK_CLOSE_SELECTORS);
  if (closeBtn) {
    await humanClick(closeBtn.locator);
    await humanPause(400);
    return true;
  }

  await page.keyboard.press("Escape");
  await humanPause(400);
  return true;
}

/** 링크 툴바 클릭 후 다이얼로그 대기 → URL 입력 → 검색(돋보기) → 확인 */
export async function applyLinkInDialog(
  contexts: PageOrFrame[],
  url: string,
  page: Page,
  platformName: string,
): Promise<boolean> {
  let dialogFound = false;
  for (let i = 0; i < 12; i++) {
    if (await detectLinkDialog(contexts)) {
      dialogFound = true;
      break;
    }
    await humanPause(300);
  }

  if (!dialogFound) {
    console.warn(`[${platformName}] 링크 다이얼로그 미발견 — ${url}`);
    return false;
  }

  if (!(await fillLinkUrl(contexts, url))) {
    console.warn(`[${platformName}] 링크 URL 입력란 미발견 — ${url}`);
    return false;
  }

  if (!(await triggerLinkUrlValidation(contexts))) {
    console.warn(`[${platformName}] 링크 URL 검색(돋보기) 실패 — ${url}`);
    return false;
  }

  if (!(await clickLinkConfirm(contexts))) {
    console.warn(`[${platformName}] 링크 확인 버튼 미발견 — ${url}`);
    return false;
  }

  console.log(`[${platformName}] 이미지 링크 연결: ${url}`);
  return true;
}
