import type { Page } from "playwright";
import { config } from "../../../config/index.js";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";
import { waitForPublishedUrl } from "./publish-verify.js";

const PLATFORM_NAME = "티스토리";

function getSearchContexts(page: Page, contexts: PageOrFrame[]): PageOrFrame[] {
  return [...new Set([page, ...contexts, ...page.frames()])];
}

/** 발행 설정 패널 열기 */
async function openPublishPanel(
  page: Page,
  contexts: PageOrFrame[],
): Promise<void> {
  const selectors = splitSelectors(EDITOR_SELECTORS.tistory.publishButton);
  const publishBtn = await findFirstVisible(getSearchContexts(page, contexts), selectors);

  if (!publishBtn) {
    throw new Error(
      `[${PLATFORM_NAME}] 발행 패널 열기 버튼을 찾을 수 없습니다. ` +
        `PUBLISH_HEADLESS=false 로 확인하세요.`,
    );
  }

  console.log(`[${PLATFORM_NAME}] ① 발행 설정 패널 열기`);
  await humanClick(publishBtn.locator);
  await humanPause(2000);
}

/** 발행 패널에서 '공개' 옵션 선택 */
async function selectPublicVisibility(page: Page): Promise<void> {
  const contexts = getSearchContexts(page, [page]);
  const publicSelectors = splitSelectors(EDITOR_SELECTORS.tistory.publicVisibility);

  const publicOption = await findFirstVisible(contexts, publicSelectors);
  if (publicOption) {
    console.log(`[${PLATFORM_NAME}] ② 공개 옵션 선택`);
    await humanClick(publicOption.locator);
    await humanPause(500);
    return;
  }

  // JS fallback — checkbox-text '공개' 또는 visibility=20
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
    console.log(`[${PLATFORM_NAME}] ② 공개 옵션 선택 (JS: ${selected})`);
    await humanPause(500);
    return;
  }

  console.log(`[${PLATFORM_NAME}] 공개 옵션 UI 미발견 — 기본값으로 진행`);
}

/** 최종 공개 발행 버튼 클릭 */
async function clickPublicPublishButton(
  page: Page,
  contexts: PageOrFrame[],
): Promise<void> {
  const selectors = splitSelectors(EDITOR_SELECTORS.tistory.publishConfirm);
  const searchContexts = getSearchContexts(page, contexts);

  for (let attempt = 0; attempt < 20; attempt++) {
    const confirmBtn = await findFirstVisible(searchContexts, selectors);
    if (confirmBtn) {
      console.log(`[${PLATFORM_NAME}] ③ 공개 발행 버튼 클릭`);
      await humanClick(confirmBtn.locator);
      await humanPause(2000);
      return;
    }
    await humanPause(500);
  }

  throw new Error(
    `[${PLATFORM_NAME}] 공개 발행 버튼을 찾을 수 없습니다. ` +
      `PUBLISH_HEADLESS=false 로 발행 패널을 확인하세요.`,
  );
}

/**
 * 티스토리 공개 발행 — 패널 열기 → 공개 선택 → 발행
 */
export async function clickTistoryPublicPublish(
  page: Page,
  contexts: PageOrFrame[],
): Promise<string | undefined> {
  if (config.publishDryRun) {
    console.log(`[${PLATFORM_NAME}] DRY-RUN: 발행 버튼 클릭 생략`);
    return undefined;
  }

  await openPublishPanel(page, contexts);
  await selectPublicVisibility(page);
  await clickPublicPublishButton(page, contexts);

  return waitForPublishedUrl(page, "tistory");
}
