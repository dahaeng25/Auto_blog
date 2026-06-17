import type { Locator, Page } from "playwright";
import {
  findFirstVisible,
  splitSelectors,
  type PageOrFrame,
} from "./dom-utils.js";
import { humanClick, humanPause } from "./human-input.js";

interface UploadImageOptions {
  page: Page;
  imagePath: string;
  contexts: PageOrFrame[];
  imageButtonSelectors: string[];
  fileInputSelectors: string[];
  platformName: string;
  label?: string;
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
  } = options;

  console.log(`[${platformName}] ${label} 업로드 시도...`);

  const button = await findFirstVisible(contexts, imageButtonSelectors);
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

  throw new Error(
    `[${platformName}] ${label} 업로드 실패 — 이미지 버튼/file input을 찾을 수 없습니다.`,
  );
}

/** 셀렉터 문자열을 배열로 변환하는 헬퍼 */
export function toSelectorArray(...selectors: string[]): string[] {
  return selectors.flatMap(splitSelectors);
}
