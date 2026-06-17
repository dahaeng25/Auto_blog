import type { Page } from "playwright";
import { config } from "../../../config/index.js";
import type { Platform } from "../../../config/platforms.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";
import { dismissNaverRightPanelIfVisible } from "./naver-sidebar-handler.js";
import { waitForPublishedUrl } from "./publish-verify.js";

interface ClickPublishOptions {
  page: Page;
  contexts: PageOrFrame[];
  publishSelectors: string;
  confirmSelectors?: string;
  platformName: string;
  platform: Platform;
}

/**
 * 발행 패널 내 최종 확인 버튼 탐색 (툴바 발행 버튼과 구분)
 */
async function clickConfirmInPanel(
  page: Page,
  contexts: PageOrFrame[],
  confirmSelectors: string,
  platformName: string,
): Promise<boolean> {
  const selectors = splitSelectors(confirmSelectors);
  const searchContexts = [...new Set([page, ...contexts, ...page.frames()])];

  // 발행 패널이 열릴 때까지 최대 10초 대기하며 확인 버튼 탐색
  for (let attempt = 0; attempt < 20; attempt++) {
    const confirmBtn = await findFirstVisible(searchContexts, selectors);

    if (confirmBtn) {
      console.log(`[${platformName}] 발행 패널 → 최종 '발행' 확인 클릭`);
      await humanClick(confirmBtn.locator);
      await humanPause(2000);
      return true;
    }

    await humanPause(500);
  }

  return false;
}

/**
 * 2단계 발행: ① 발행 버튼 → ② 패널 내 최종 확인 → ③ URL 변경 검증
 */
export async function clickPublishButton(
  options: ClickPublishOptions,
): Promise<string | undefined> {
  const {
    page,
    contexts,
    publishSelectors,
    confirmSelectors,
    platformName,
    platform,
  } = options;

  if (config.publishDryRun) {
    console.log(`[${platformName}] DRY-RUN: 발행 버튼 클릭 생략 (에디터 입력만 완료)`);
    return undefined;
  }

  if (platform === "naver") {
    await dismissNaverRightPanelIfVisible(page);
  }

  const searchContexts = [...new Set([page, ...contexts, ...page.frames()])];

  // ① 상단/에디터 '발행' 또는 '완료' 버튼 — 발행 패널 열기
  const publishBtn = await findFirstVisible(
    searchContexts,
    splitSelectors(publishSelectors),
  );

  if (!publishBtn) {
    throw new Error(
      `[${platformName}] 발행 버튼을 찾을 수 없습니다. ` +
        `PUBLISH_HEADLESS=false 로 브라우저에서 확인하세요.`,
    );
  }

  console.log(`[${platformName}] ① 발행 패널 열기 클릭`);
  await humanClick(publishBtn.locator);
  await humanPause(2500);

  // ② 발행 패널 내 최종 확인
  if (confirmSelectors) {
    const confirmed = await clickConfirmInPanel(
      page,
      searchContexts,
      confirmSelectors,
      platformName,
    );

    if (!confirmed) {
      throw new Error(
        `[${platformName}] 발행 확인 버튼을 찾을 수 없습니다. ` +
          `발행 패널이 열렸는지 PUBLISH_HEADLESS=false 로 확인하세요.`,
      );
    }
  }

  // ③ URL이 에디터에서 벗어날 때까지 대기 (실제 발행 검증)
  return waitForPublishedUrl(page, platform);
}
