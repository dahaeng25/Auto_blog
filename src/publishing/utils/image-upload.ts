import type { Locator, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import {
  findFirstVisible,
  splitSelectors,
  type PageOrFrame,
} from "./dom-utils.js";
import { pasteHtmlToEditor } from "./editor-paste.js";
import { humanClick, humanPause } from "./human-input.js";

interface UploadImageOptions {
  page: Page;
  imagePath: string;
  contexts: PageOrFrame[];
  imageButtonSelectors: string[];
  fileInputSelectors: string[];
  platformName: string;
  label?: string;
  /** filechooser/input 실패 시 에디터에 base64 img 삽입 */
  editorFallback?: Locator;
}

/** filechooser 이벤트로 이미지 업로드 (가장 안정적) */
async function uploadViaFileChooser(
  page: Page,
  button: Locator,
  imagePath: string,
): Promise<boolean> {
  try {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      humanClick(button),
    ]);
    await fileChooser.setFiles(imagePath);
    await humanPause(2500);
    return true;
  } catch {
    return false;
  }
}

/** 모든 frame에서 숨겨진 file input 탐색 후 강제 업로드 */
async function uploadViaHiddenInput(
  page: Page,
  imagePath: string,
  fileInputSelectors: string[],
): Promise<boolean> {
  const frames: PageOrFrame[] = [page, ...page.frames()];

  for (const ctx of frames) {
    for (const sel of fileInputSelectors) {
      const input = ctx.locator(sel).first();
      try {
        if ((await input.count()) > 0) {
          await input.setInputFiles(imagePath);
          await humanPause(2500);
          return true;
        }
      } catch {
        // 다음 시도
      }
    }
  }
  return false;
}

function imageToDataUrl(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/png";
  const data = fs.readFileSync(imagePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

/** 에디터에 base64 img 태그로 삽입 (티스토리 TinyMCE 폴백) */
async function insertImageViaHtml(
  page: Page,
  editorLocator: Locator,
  imagePath: string,
): Promise<boolean> {
  try {
    const src = imageToDataUrl(imagePath);
    const html = `<p><img src="${src}" alt="" /></p>`;
    await pasteHtmlToEditor(page, editorLocator, html);
    return true;
  } catch {
    return false;
  }
}

/** 이미지 버튼이 나타날 때까지 대기 */
async function waitForImageButton(
  contexts: PageOrFrame[],
  selectors: string[],
  timeoutMs = 15_000,
): Promise<{ locator: Locator; context: PageOrFrame } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await findFirstVisible(contexts, selectors);
    if (found) return found;
    await humanPause(500);
  }
  return null;
}

/**
 * 이미지 업로드 — filechooser 우선, hidden input fallback.
 */
export async function uploadImageRobust(
  options: UploadImageOptions,
): Promise<void> {
  const {
    page,
    imagePath,
    contexts,
    imageButtonSelectors,
    fileInputSelectors,
    platformName,
    label = "이미지",
    editorFallback,
  } = options;

  console.log(`[${platformName}] ${label} 업로드 시도...`);

  const button = await waitForImageButton(contexts, imageButtonSelectors);
  if (button) {
    const ok = await uploadViaFileChooser(page, button.locator, imagePath);
    if (ok) {
      console.log(`[${platformName}] ${label} 업로드 완료 (filechooser)`);
      return;
    }
    console.log(`[${platformName}] filechooser 실패 → hidden input 시도`);
  } else {
    console.log(`[${platformName}] 이미지 버튼 미발견 → hidden input 시도`);
  }

  const viaInput = await uploadViaHiddenInput(
    page,
    imagePath,
    fileInputSelectors,
  );
  if (viaInput) {
    console.log(`[${platformName}] ${label} 업로드 완료 (hidden input)`);
    return;
  }

  if (editorFallback) {
    console.log(`[${platformName}] 버튼/input 실패 → HTML 이미지 삽입 시도`);
    const viaHtml = await insertImageViaHtml(page, editorFallback, imagePath);
    if (viaHtml) {
      console.log(`[${platformName}] ${label} 업로드 완료 (HTML 삽입)`);
      return;
    }
  }

  throw new Error(
    `[${platformName}] ${label} 업로드 실패 — 이미지 버튼/file input을 찾을 수 없습니다.`,
  );
}

/** 셀렉터 문자열을 배열로 변환하는 헬퍼 */
export function toSelectorArray(...selectors: string[]): string[] {
  return selectors.flatMap(splitSelectors);
}
