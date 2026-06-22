import type { Frame, Locator, Page } from "playwright";
import { humanClick, humanPause } from "./human-input.js";
import { writeHtmlToClipboard } from "./clipboard.js";
import { focusEditorEnd } from "./editor-cursor.js";

const IS_MAC = process.platform === "darwin";
const PASTE_MODIFIER = IS_MAC ? "Meta" : "Control";

/**
 * contenteditable 영역에 execCommand('insertHTML')로 HTML을 삽입합니다.
 * locator.evaluate는 소속 iframe 컨텍스트에서 실행됩니다.
 */
async function insertHtmlViaExecCommand(
  locator: Locator,
  html: string,
): Promise<boolean> {
  try {
    await humanClick(locator);

    return await locator.evaluate((el, htmlContent) => {
      if (el instanceof HTMLElement) {
        el.focus();
      }
      return document.execCommand("insertHTML", false, htmlContent);
    }, html);
  } catch {
    return false;
  }
}

/**
 * 클립보드에 HTML을 복사한 뒤 Ctrl+V / Meta+V로 붙여넣기합니다.
 * execCommand 실패 시 2차 fallback으로 사용합니다.
 */
async function pasteHtmlViaClipboard(
  page: Page,
  locator: Locator,
  html: string,
): Promise<void> {
  await writeHtmlToClipboard(page, html);
  await humanClick(locator);
  await humanPause(200);
  await page.keyboard.press(`${PASTE_MODIFIER}+v`);
  await humanPause(500);
}

/**
 * 에디터에 HTML 본문을 삽입합니다.
 * 1차: insertHTML → 2차: 클립보드 붙여넣기
 */
export async function pasteHtmlToEditor(
  page: Page,
  editorLocator: Locator,
  html: string,
): Promise<void> {
  const viaExec = await insertHtmlViaExecCommand(editorLocator, html);
  if (viaExec) {
    console.log("[EditorPaste] insertHTML 성공");
    return;
  }

  console.log("[EditorPaste] insertHTML 실패 → 클립보드 붙여넣기 시도");
  await pasteHtmlViaClipboard(page, editorLocator, html);
}

/** 본문 끝에 HTML 이어 붙이기 (순서 유지) */
export async function appendHtmlToEditor(
  page: Page,
  editorLocator: Locator,
  html: string,
): Promise<void> {
  await focusEditorEnd(editorLocator);
  await pasteHtmlToEditor(page, editorLocator, html);
}

type PageOrFrame = Page | Frame;

/** page/frame 내부 contenteditable 탐색 */
export async function findContentEditable(
  ctx: PageOrFrame,
  selector: string,
): Promise<Locator> {
  const direct = ctx.locator(selector).first();
  if ((await direct.count()) > 0) {
    return direct;
  }

  // Page인 경우 하위 iframe까지 탐색
  if ("frames" in ctx) {
    for (const frame of ctx.frames()) {
      const frameLocator = frame.locator(selector).first();
      if ((await frameLocator.count()) > 0) {
        return frameLocator;
      }
    }
  }

  throw new Error(`contenteditable을 찾을 수 없습니다: ${selector}`);
}
