import type { Frame, Locator } from "playwright";
import { humanClick, humanPause } from "./human-input.js";
import { writeHtmlToClipboard } from "./clipboard.js";
import { fillPlainTextToEditor } from "./editor-paste.js";
import { sanitizeBlogTitle } from "../../content/sanitize-title.js";

const IS_MAC = process.platform === "darwin";
const PASTE_MODIFIER = IS_MAC ? "Meta" : "Control";

/** 네이버 제목 최대 글자수 */
const NAVER_TITLE_MAX = 100;

/** 제목 전용 셀렉터 */
const TITLE_SELECTORS = [
  ".se-component.se-documentTitle [contenteditable='true']",
  ".se-documentTitle .se-title-text",
  ".se-title-text[contenteditable='true']",
  "div.se-documentTitle .se-text-paragraph",
  ".se-documentTitle p",
];

/** 본문 후보 셀렉터 (우선순위 순) */
const BODY_SELECTORS = [
  ".se-main-container .se-component.se-text .se-text-paragraph",
  ".se-main-container .se-component.se-text p",
  ".se-main-container .se-text-paragraph",
  ".se-component.se-text .se-text-paragraph",
  ".se-component.se-text p",
  ".se-section-text .se-text-paragraph",
  ".se-module-text p",
  ".se-canvas .se-component.se-text [contenteditable='true']",
  ".se-contents .se-component.se-text p",
];

/** 본문 활성화용 플레이스홀더/영역 클릭 */
const BODY_ACTIVATE_SELECTORS = [
  ".se-component.se-text .se-placeholder",
  'span.se-placeholder:has-text("내용")',
  'span.se-placeholder:has-text("글")',
  ".se-main-container",
  ".se-canvas",
  ".se-contents",
];

async function isTitleElement(locator: Locator): Promise<boolean> {
  try {
    return await locator.evaluate((el) => {
      return (
        el.closest(".se-documentTitle") !== null ||
        el.closest(".se-title") !== null ||
        el.classList.contains("se-title-text")
      );
    });
  } catch {
    return true;
  }
}

async function findFirstInFrame(
  frame: Frame,
  selectors: string[],
  excludeTitle = false,
): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = frame.locator(sel).first();
    try {
      if ((await loc.count()) === 0 || !(await loc.isVisible())) continue;
      if (excludeTitle && (await isTitleElement(loc))) continue;
      return loc;
    } catch {
      // 다음 셀렉터
    }
  }
  return null;
}

/** 본문 영역 클릭으로 에디터 활성화 */
async function activateBodyArea(frame: Frame): Promise<void> {
  for (const sel of BODY_ACTIVATE_SELECTORS) {
    const loc = frame.locator(sel).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await humanClick(loc);
        await humanPause(400);
        return;
      }
    } catch {
      // ignore
    }
  }
}

/** 모든 본문 후보를 순회하며 제목이 아닌 요소 탐색 */
async function findBodyByScanning(frame: Frame): Promise<Locator | null> {
  const combined = BODY_SELECTORS.join(", ");
  const candidates = frame.locator(combined);
  const count = await candidates.count();

  for (let i = 0; i < count; i++) {
    const candidate = candidates.nth(i);
    try {
      if (!(await candidate.isVisible())) continue;
      if (await isTitleElement(candidate)) continue;
      return candidate;
    } catch {
      // 다음
    }
  }
  return null;
}

export async function findNaverTitleField(frame: Frame): Promise<Locator> {
  const loc = await findFirstInFrame(frame, TITLE_SELECTORS);
  if (!loc) {
    throw new Error(
      "[네이버] 제목 입력란을 찾을 수 없습니다. " +
        "세션이 만료됐을 수 있습니다 → npm run auth:setup 후 auth:verify",
    );
  }
  return loc;
}

/**
 * 네이버 본문 입력란 탐색 — 팝업 닫힌 직후 로딩 대기 + 본문 영역 활성화
 */
export async function findNaverBodyField(frame: Frame): Promise<Locator> {
  console.log("[네이버] 본문 입력란 탐색 중...");

  for (let attempt = 0; attempt < 30; attempt++) {
    let loc = await findFirstInFrame(frame, BODY_SELECTORS, true);
    if (loc) {
      console.log("[네이버] 본문 입력란 발견");
      return loc;
    }

    loc = await findBodyByScanning(frame);
    if (loc) {
      console.log("[네이버] 본문 입력란 발견 (스캔)");
      return loc;
    }

    // 본문 영역 클릭으로 에디터 활성화 시도
    await activateBodyArea(frame);
    await humanPause(500);
  }

  throw new Error(
    "[네이버] 본문 입력란을 찾을 수 없습니다. " +
      "PUBLISH_HEADLESS=false 로 브라우저에서 에디터 상태를 확인하세요.",
  );
}

export async function fillNaverTitle(
  titleLocator: Locator,
  title: string,
): Promise<void> {
  const plainTitle = sanitizeBlogTitle(title).slice(0, NAVER_TITLE_MAX);

  console.log(`[네이버] 제목 입력 (${plainTitle.length}자)`);

  const page = titleLocator.page();
  await fillPlainTextToEditor(page, titleLocator, plainTitle);

  await titleLocator.press("Tab");
  await humanPause(500);

  await titleLocator.evaluate((el) => {
    if (el instanceof HTMLElement) el.blur();
  });
  await humanPause(300);
}

/** 본문 끝으로 커서 이동 */
export async function focusNaverBodyEnd(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const container =
      document.querySelector(".se-main-container") ??
      document.querySelector(".se-canvas") ??
      document.querySelector(".se-contents");

    if (!container) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await humanPause(200);
}

/** 본문 끝에 HTML 추가 삽입 (스마트에디터 전체 컨테이너 기준) */
export async function appendNaverBody(
  frame: Frame,
  _bodyLocator: Locator,
  html: string,
): Promise<void> {
  await focusNaverBodyEnd(frame);

  const inserted = await frame.evaluate((htmlContent) => {
    const container =
      document.querySelector(".se-main-container") ??
      document.querySelector(".se-canvas") ??
      document.querySelector(".se-contents");

    if (!container) return false;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    return document.execCommand("insertHTML", false, htmlContent);
  }, html);

  if (inserted) return;

  const page = frame.page();
  await writeHtmlToClipboard(page, html);
  await focusNaverBodyEnd(frame);
  await page.keyboard.press(`${PASTE_MODIFIER}+v`);
  await humanPause(500);
}

export async function fillNaverBody(
  frame: Frame,
  bodyLocator: Locator,
  html: string,
): Promise<void> {
  console.log(`[네이버] 본문 입력 (${html.length}자)`);

  await humanClick(bodyLocator);
  await bodyLocator.focus();
  await humanPause(300);

  const inserted = await bodyLocator.evaluate((el, htmlContent) => {
    if (!(el instanceof HTMLElement)) return false;

    el.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    return document.execCommand("insertHTML", false, htmlContent);
  }, html);

  if (inserted) {
    console.log("[네이버] 본문 insertHTML 성공");
    return;
  }

  console.log("[네이버] insertHTML 실패 → 본문란 클립보드 붙여넣기");

  const page = frame.page();
  await writeHtmlToClipboard(page, html);

  await humanClick(bodyLocator);
  await bodyLocator.focus();
  await humanPause(200);
  await bodyLocator.press(`${PASTE_MODIFIER}+v`);
  await humanPause(500);
}
