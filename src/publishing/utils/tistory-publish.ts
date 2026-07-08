import type { Page } from "playwright";
import { config } from "../../../config/index.js";
import { isServerless } from "../../browser/is-serverless.js";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";
import { waitForPublishedUrl } from "./publish-verify.js";
import { selectTistoryCategory } from "./tistory-category-select.js";

const PLATFORM_NAME = "티스토리";

function panelSettleMs(): number {
  return isServerless() ? 4000 : 2000;
}

function publishConfirmAttempts(): number {
  return isServerless() ? 25 : 15;
}

function getSearchContexts(page: Page, contexts: PageOrFrame[]): PageOrFrame[] {
  return [...new Set([page, ...contexts, ...page.frames()])];
}

/** 발행 설정 패널 열기 */
async function openPublishPanel(
  page: Page,
  contexts: PageOrFrame[],
): Promise<void> {
  const selectors = splitSelectors(EDITOR_SELECTORS.tistory.publishButton);
  const searchContexts = getSearchContexts(page, contexts);
  const attempts = isServerless() ? 20 : 8;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const publishBtn = await findFirstVisible(searchContexts, selectors);
    if (publishBtn) {
      console.log(`[${PLATFORM_NAME}] ① 발행 설정 패널 열기`);
      await humanClick(publishBtn.locator);
      await humanPause(panelSettleMs());
      return;
    }
    await humanPause(500);
  }

  throw new Error(
    `[${PLATFORM_NAME}] 발행 패널 열기 버튼을 찾을 수 없습니다. ` +
      `PUBLISH_HEADLESS=false 로 확인하세요.`,
  );
}

/** 발행 패널에서 '공개' 옵션 선택 */
async function selectPublicVisibility(page: Page): Promise<void> {
  const contexts = getSearchContexts(page, [page]);
  const publicSelectors = splitSelectors(EDITOR_SELECTORS.tistory.publicVisibility);

  const publicOption = await findFirstVisible(contexts, publicSelectors);
  if (publicOption) {
    console.log(`[${PLATFORM_NAME}] ③ 공개 옵션 선택`);
    await humanClick(publicOption.locator);
    await humanPause(500);
    return;
  }

  const selected = await page.evaluate(() => {
    const spans = document.querySelectorAll("span.checkbox-text");
    for (const span of Array.from(spans)) {
      if (span.textContent?.trim() === "공개") {
        (span as HTMLElement).click();
        return "checkbox-text";
      }
    }

    const publicInput = document.querySelector(
      '#open20, input[value="20"][name*="open"], input[value="20"][name*="visibility"]',
    ) as HTMLElement | null;
    if (publicInput) {
      publicInput.click();
      return "input-20";
    }

    const labels = document.querySelectorAll("label");
    for (const label of Array.from(labels)) {
      if (label.textContent?.trim() === "공개") {
        label.click();
        return "label";
      }
    }

    return null;
  });

  if (selected) {
    console.log(`[${PLATFORM_NAME}] ③ 공개 옵션 선택 (JS: ${selected})`);
    await humanPause(500);
    return;
  }

  console.log(`[${PLATFORM_NAME}] 공개 옵션 UI 미발견 — 기본값으로 진행`);
}

/** JS로 공개 발행 버튼 탐색·클릭 */
async function clickPublishViaJs(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const prefer = ["#publish-btn", "#publish-btn-public", "button#publish-btn"];
    for (const sel of prefer) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el && isVisible(el) && !el.hasAttribute("disabled")) {
        el.click();
        return sel;
      }
    }

    const buttons = Array.from(
      document.querySelectorAll("button, a[role='button'], input[type='submit']"),
    ) as HTMLElement[];

    const priority = ["공개 발행", "발행하기", "발행"];
    for (const label of priority) {
      for (const btn of buttons) {
        const text = btn.textContent?.trim() ?? btn.getAttribute("value") ?? "";
        if (!isVisible(btn) || btn.hasAttribute("disabled")) continue;
        if (text === label || (label === "발행" && text.endsWith("발행"))) {
          if (text.includes("예약")) continue;
          btn.click();
          return text;
        }
      }
    }

    return null;
  });

  if (clicked) {
    console.log(`[${PLATFORM_NAME}] ④ 공개 발행 버튼 클릭 (JS: ${clicked})`);
    await humanPause(2000);
    return true;
  }

  return false;
}

/** 최종 공개 발행 버튼 클릭 */
async function clickPublicPublishButton(
  page: Page,
  contexts: PageOrFrame[],
): Promise<void> {
  const selectors = splitSelectors(EDITOR_SELECTORS.tistory.publishConfirm);
  const searchContexts = getSearchContexts(page, contexts);

  for (let attempt = 0; attempt < publishConfirmAttempts(); attempt++) {
    const confirmBtn = await findFirstVisible(searchContexts, selectors);
    if (confirmBtn) {
      console.log(`[${PLATFORM_NAME}] ④ 공개 발행 버튼 클릭`);
      await humanClick(confirmBtn.locator);
      await humanPause(2000);
      return;
    }

    if (await clickPublishViaJs(page)) {
      return;
    }

    await humanPause(500);
  }

  throw new Error(
    `[${PLATFORM_NAME}] 공개 발행 버튼을 찾을 수 없습니다. ` +
      `카테고리 미선택 또는 PUBLISH_HEADLESS=false 로 발행 패널을 확인하세요.`,
  );
}

export interface TistoryPublishOptions {
  title?: string;
  keywords?: string;
}

/**
 * 티스토리 공개 발행 — 패널 열기 → 카테고리 → 공개 → 발행
 */
export async function clickTistoryPublicPublish(
  page: Page,
  contexts: PageOrFrame[],
  options?: TistoryPublishOptions,
): Promise<string | undefined> {
  if (config.publishDryRun) {
    console.log(`[${PLATFORM_NAME}] DRY-RUN: 발행 버튼 클릭 생략`);
    return undefined;
  }

  const title = options?.title ?? "";
  const keywords = options?.keywords ?? "";

  await openPublishPanel(page, contexts);
  await selectTistoryCategory(page, contexts, title, keywords);
  await selectPublicVisibility(page);
  await clickPublicPublishButton(page, contexts);

  return waitForPublishedUrl(page, "tistory");
}
