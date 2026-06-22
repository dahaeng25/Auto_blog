import type { Frame, Locator } from "playwright";
import { humanClick, humanPause } from "./human-input.js";

/** contenteditable 끝으로 커서 이동 */
export async function focusEditorEnd(locator: Locator): Promise<void> {
  await humanClick(locator);
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await humanPause(200);
}

/** 에디터 본문에서 n번째 h2 앞에 커서 배치 */
export async function focusBeforeH2InEditor(
  locator: Locator,
  h2Index: number,
): Promise<boolean> {
  await humanClick(locator);
  return locator.evaluate((el, index) => {
    const root =
      el instanceof HTMLElement
        ? el.closest("[contenteditable='true']") ?? el
        : document.body;

    const h2s = Array.from(root.querySelectorAll("h2"));
    if (index < 0 || index >= h2s.length) return false;

    const h2 = h2s[index]!;
    const anchor =
      h2.closest(".se-component") ??
      h2.closest("p")?.parentElement ??
      h2.parentElement ??
      h2;

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStartBefore(anchor);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    if (anchor instanceof HTMLElement) {
      anchor.scrollIntoView({ block: "center" });
    }
    return true;
  }, h2Index);
}

/** 네이버 스마트에디터 — n번째 h2 앞에 커서 배치 */
export async function focusNaverBeforeH2(
  frame: Frame,
  h2Index: number,
): Promise<boolean> {
  return frame.evaluate((index) => {
    const container =
      document.querySelector(".se-main-container") ??
      document.querySelector(".se-canvas") ??
      document.querySelector(".se-contents");

    if (!container) return false;

    const h2s = Array.from(container.querySelectorAll("h2"));
    if (index < 0 || index >= h2s.length) return false;

    const h2 = h2s[index]!;
    const component =
      h2.closest(".se-component") ??
      h2.closest(".se-section") ??
      h2.parentElement ??
      h2;

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStartBefore(component);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    if (component instanceof HTMLElement) {
      component.scrollIntoView({ block: "center" });
    }
    return true;
  }, h2Index);
}
