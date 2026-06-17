import type { Page } from "playwright";
import { findFirstVisible, splitSelectors, type PageOrFrame } from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";

/** "작성 중인 글이 있습니다" 팝업 감지 */
const IN_PROGRESS_DIALOG_TEXT = "작성 중인 글이 있습니다";

const DRAFT_DIALOG_MARKERS = [
  `text=${IN_PROGRESS_DIALOG_TEXT}`,
  "text=임시 저장된 글이 있습니다",
  "text=이어서 작성하시겠습니까",
  "text=이전에 작성하던",
  ".se-popup",
  '[class*="layer_popup"]',
];

/** 이어쓰기 팝업 → '취소' 클릭 (새 글 작성) */
const CANCEL_SELECTORS = [
  'button:has-text("취소")',
  '.se-popup-button-cancel',
  'button[class*="cancel"]',
  'a:has-text("취소")',
];

/** 구형 팝업 fallback — '새로 작성' */
const NEW_POST_SELECTORS = [
  'button:has-text("새로 작성")',
  'button:has-text("새 글로 작성")',
  'a:has-text("새로 작성")',
];

/** 팝업 내부에서 '취소' 버튼 탐색 */
async function clickCancelInDialog(
  contexts: PageOrFrame[],
): Promise<boolean> {
  for (const ctx of contexts) {
    // "작성 중인 글이 있습니다" 텍스트가 있는 팝업 컨테이너 우선
    const dialogs = [
      ctx.locator(".se-popup").filter({ hasText: IN_PROGRESS_DIALOG_TEXT }),
      ctx.locator('[class*="popup"]').filter({ hasText: IN_PROGRESS_DIALOG_TEXT }),
      ctx.locator('[class*="layer"]').filter({ hasText: IN_PROGRESS_DIALOG_TEXT }),
    ];

    for (const dialog of dialogs) {
      try {
        if ((await dialog.count()) === 0 || !(await dialog.first().isVisible())) {
          continue;
        }

        const cancelBtn = dialog
          .first()
          .locator('button:has-text("취소"), a:has-text("취소")')
          .first();

        if ((await cancelBtn.count()) > 0 && (await cancelBtn.isVisible())) {
          console.log("[네이버] '작성 중인 글이 있습니다' 팝업 → '취소' 클릭");
          await humanClick(cancelBtn);
          return true;
        }
      } catch {
        // 다음 시도
      }
    }
  }

  // 팝업 컨테이너 없이 visible한 취소 버튼 탐색
  const cancel = await findFirstVisible(contexts, CANCEL_SELECTORS);
  if (cancel) {
    console.log("[네이버] 임시저장 팝업 → '취소' 클릭");
    await humanClick(cancel.locator);
    return true;
  }

  return false;
}

/** 구형 UI fallback — '새로 작성' */
async function clickNewPostFallback(
  contexts: PageOrFrame[],
): Promise<boolean> {
  const btn = await findFirstVisible(
    contexts,
    splitSelectors(NEW_POST_SELECTORS.join(",")),
  );
  if (btn) {
    console.log("[네이버] 임시저장 팝업 → '새로 작성' 클릭 (fallback)");
    await humanClick(btn.locator);
    return true;
  }
  return false;
}

async function isDraftDialogVisible(contexts: PageOrFrame[]): Promise<boolean> {
  for (const ctx of contexts) {
    for (const marker of DRAFT_DIALOG_MARKERS) {
      try {
        const el = ctx.locator(marker).first();
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

/**
 * 네이버 블로그 임시저장 팝업을 처리합니다.
 * "작성 중인 글이 있습니다" → '취소' 클릭하여 새 글 작성 화면으로 진입합니다.
 */
export async function dismissNaverDraftDialog(page: Page): Promise<void> {
  console.log("[네이버] 임시저장 팝업 확인 중...");

  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const contexts: PageOrFrame[] = [page, ...page.frames()];

    if (await isDraftDialogVisible(contexts)) {
      const clicked =
        (await clickCancelInDialog(contexts)) ||
        (await clickNewPostFallback(contexts));

      if (clicked) {
        await humanPause(2000);
        await waitForNaverEditorReady(page);
        return;
      }
    }

    await humanPause(500);
  }

  console.log("[네이버] 임시저장 팝업 없음 — 바로 진행");
}

/** 에디터 제목+본문 영역이 준비될 때까지 대기 */
export async function waitForNaverEditorReady(page: Page): Promise<void> {
  const contexts: PageOrFrame[] = [page, ...page.frames()];
  const readySelectors = [
    ".se-documentTitle",
    ".se-main-container",
    ".se-component.se-text",
    ".se-canvas",
  ];

  for (let i = 0; i < 30; i++) {
    for (const ctx of contexts) {
      for (const sel of readySelectors) {
        try {
          const el = ctx.locator(sel).first();
          if ((await el.count()) > 0 && (await el.isVisible())) {
            console.log("[네이버] 에디터 준비 완료");
            await humanPause(1000);
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    await humanPause(500);
  }
}
