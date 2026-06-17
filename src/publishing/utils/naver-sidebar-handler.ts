import type { Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";

/** 스마트에디터 ONE 도움말 패널 — 우측에 자동 노출, 발행 패널을 가림 */
const HELP_PANEL_CLOSE_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.helpPanelClose);
const HELP_PANEL_MARKERS = splitSelectors(EDITOR_SELECTORS.naver.helpPanel);

const RIGHT_PANEL_MARKERS = splitSelectors(EDITOR_SELECTORS.naver.rightPanel);
const RIGHT_PANEL_CLOSE_SELECTORS = splitSelectors(EDITOR_SELECTORS.naver.rightPanelClose);

/** mainFrame(에디터) 우선 탐색 */
async function getOrderedContexts(page: Page): Promise<PageOrFrame[]> {
  const ordered: PageOrFrame[] = [];
  const seen = new Set<PageOrFrame>();

  const push = (ctx: PageOrFrame): void => {
    if (!seen.has(ctx)) {
      seen.add(ctx);
      ordered.push(ctx);
    }
  };

  try {
    const iframe = page.locator(EDITOR_SELECTORS.naver.mainFrame).first();
    if ((await iframe.count()) > 0) {
      const frame = await iframe.elementHandle()?.contentFrame();
      if (frame) push(frame);
    }
  } catch {
    // ignore
  }

  push(page);
  for (const frame of page.frames()) {
    push(frame);
  }

  return ordered;
}

async function isVisibleInContexts(
  contexts: PageOrFrame[],
  selectors: string[],
): Promise<boolean> {
  for (const ctx of contexts) {
    for (const sel of selectors) {
      try {
        const el = ctx.locator(sel).first();
        if ((await el.count()) > 0 && (await el.isVisible())) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }
  return false;
}

/** 도움말 패널 닫기 버튼 클릭 (Playwright locator) */
async function clickHelpPanelCloseButton(contexts: PageOrFrame[]): Promise<boolean> {
  const closeBtn = await findFirstVisible(contexts, HELP_PANEL_CLOSE_SELECTORS);
  if (!closeBtn) return false;

  console.log("[네이버] 도움말 패널 닫기(X) 클릭");

  try {
    await humanClick(closeBtn.locator);
    return true;
  } catch {
    try {
      await closeBtn.locator.click({ force: true, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/** iframe 내부 JS로 도움말 닫기 버튼 클릭 또는 패널 숨김 */
async function dismissHelpPanelViaJs(contexts: PageOrFrame[]): Promise<boolean> {
  for (const ctx of contexts) {
    try {
      const result = await ctx.evaluate(() => {
        const isVisible = (el: Element): boolean => {
          if (!(el instanceof HTMLElement)) return false;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (parseFloat(style.opacity) < 0.05) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const closeBtn = document.querySelector(
          "button.se-help-panel-close-button",
        ) as HTMLElement | null;

        if (closeBtn && isVisible(closeBtn)) {
          closeBtn.click();
          return "clicked-close";
        }

        const panels = document.querySelectorAll(
          '[class*="se-help-panel"], [class*="help-panel"], [class*="se-help"]',
        );

        let hidden = false;
        for (const panel of panels) {
          if (!(panel instanceof HTMLElement) || !isVisible(panel)) continue;

          const innerClose = panel.querySelector(
            "button.se-help-panel-close-button, [class*='close']",
          ) as HTMLElement | null;

          if (innerClose && isVisible(innerClose)) {
            innerClose.click();
            return "clicked-inner-close";
          }

          panel.style.display = "none";
          panel.style.visibility = "hidden";
          panel.setAttribute("aria-hidden", "true");
          hidden = true;
        }

        return hidden ? "hidden-panel" : null;
      });

      if (result) {
        console.log(`[네이버] 도움말 패널 JS 처리: ${result}`);
        return true;
      }
    } catch {
      // cross-origin frame 등 — 다음 context
    }
  }

  return false;
}

/** Escape 키로 도움말/사이드 패널 닫기 시도 */
async function pressEscapeToClose(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await humanPause(400);
}

/**
 * 스마트에디터 ONE 도움말 패널 전용 닫기.
 * `button.se-help-panel-close-button` 이 iframe#mainFrame 안에 있습니다.
 */
async function dismissNaverHelpPanel(page: Page): Promise<boolean> {
  const contexts = await getOrderedContexts(page);

  if (!(await isVisibleInContexts(contexts, HELP_PANEL_MARKERS))) {
    return false;
  }

  console.log("[네이버] 도움말 패널 감지 — 닫기 시도");

  for (let attempt = 0; attempt < 5; attempt++) {
    const clicked =
      (await dismissHelpPanelViaJs(contexts)) ||
      (await clickHelpPanelCloseButton(contexts));

    if (clicked) {
      await humanPause(600);
      if (!(await isVisibleInContexts(contexts, HELP_PANEL_MARKERS))) {
        console.log("[네이버] 도움말 패널 닫기 완료");
        return true;
      }
      continue;
    }

    await pressEscapeToClose(page);
    await humanPause(600);

    if (!(await isVisibleInContexts(contexts, HELP_PANEL_MARKERS))) {
      console.log("[네이버] 도움말 패널 닫기 완료 (Escape)");
      return true;
    }
  }

  console.log("[네이버] 도움말 패널 닫기 실패 — 우측 패널 fallback 시도");
  return false;
}

/** 기타 우측 사이드 패널 닫기 (도움말 외) */
async function dismissOtherRightPanels(page: Page): Promise<void> {
  const contexts = await getOrderedContexts(page);

  for (let i = 0; i < 5; i++) {
    const hasPanel = await isVisibleInContexts(contexts, RIGHT_PANEL_MARKERS);
    if (!hasPanel) return;

    const closeBtn = await findFirstVisible(contexts, RIGHT_PANEL_CLOSE_SELECTORS);
    if (closeBtn) {
      console.log("[네이버] 우측 패널 닫기(X) 클릭");
      await humanClick(closeBtn.locator);
      await humanPause(600);
      continue;
    }

    return;
  }
}

/** 도움말·우측 패널이 화면에 보이는지 빠르게 확인 */
export async function isNaverRightPanelVisible(page: Page): Promise<boolean> {
  const contexts = await getOrderedContexts(page);
  const helpVisible = await isVisibleInContexts(contexts, HELP_PANEL_MARKERS);
  const rightVisible = await isVisibleInContexts(contexts, RIGHT_PANEL_MARKERS);
  return helpVisible || rightVisible;
}

/**
 * 네이버 글쓰기 화면 우측 패널(도움말·도우미 등)을 닫습니다.
 * 발행 패널이 가려지는 현상을 방지합니다. 반복 호출 가능합니다.
 */
export async function dismissNaverRightPanel(page: Page): Promise<void> {
  const helpDismissed = await dismissNaverHelpPanel(page);
  await dismissOtherRightPanels(page);

  if (!helpDismissed) {
    const contexts = await getOrderedContexts(page);
    const stillOpen = await isVisibleInContexts(contexts, HELP_PANEL_MARKERS);
    if (!stillOpen) {
      console.log("[네이버] 우측 패널 없음 — 바로 진행");
    }
  }
}

/** 패널이 보일 때만 닫기 — 본문 삽입 루프 등 중간 단계용 */
export async function dismissNaverRightPanelIfVisible(page: Page): Promise<boolean> {
  if (!(await isNaverRightPanelVisible(page))) {
    return false;
  }
  await dismissNaverRightPanel(page);
  return true;
}
