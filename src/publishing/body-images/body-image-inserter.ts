import type { Frame, Locator, Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { config } from "../../../config/index.js";
import {
  appendNaverBody,
  focusNaverBodyEnd,
} from "../utils/naver-editor.js";
import {
  focusBeforeH2InEditor,
  focusEditorEnd,
  focusNaverBeforeH2,
} from "../utils/editor-cursor.js";
import { appendHtmlToEditor } from "../utils/editor-paste.js";
import { splitSelectors } from "../utils/dom-utils.js";
import { humanClick, humanPause } from "../utils/human-input.js";
import { applyLinkInDialog } from "../utils/naver-link-dialog.js";
import { dismissNaverRightPanelIfVisible } from "../utils/naver-sidebar-handler.js";
import {
  toSelectorArray,
  uploadImageRobust,
} from "../utils/image-upload.js";
import type { PreparedImageAsset } from "../images/prepare-naver-images.js";
import { setNaverImageAltText } from "../utils/naver-image-meta.js";
import { splitHtmlForPublishing } from "./html-splitter.js";
import { loadBodyImages, type ResolvedBodyImage } from "./image-manifest.js";

export interface FillBodyWithImagesOptions {
  page: Page;
  platform: "naver" | "tistory";
  platformName: string;
  htmlBody: string;
  thumbnailPath: string;
  bodyLocator: Locator;
  editorContext: Frame | Page;
  imageButtonSelector: string;
  fileInputSelector: string;
  /** 키워드 파일명·메타가 적용된 이미지 (네이버·티스토리 공통) */
  preparedImages?: PreparedImageAsset[];
}

async function countNaverImages(frame: Frame): Promise<number> {
  return frame.locator(".se-component.se-image").count();
}

async function waitForNaverImageIncrease(
  frame: Frame,
  previousCount: number,
  timeoutMs = 20_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await countNaverImages(frame);
    if (count > previousCount) {
      await humanPause(800);
      return;
    }
    await humanPause(500);
  }
  console.warn("[BodyImage] 네이버 이미지 컴포넌트 증가 미확인 — 계속 진행");
}

async function uploadEditorImage(
  options: FillBodyWithImagesOptions,
  imagePath: string,
  label: string,
  altText?: string,
): Promise<void> {
  const contexts = [
    options.page,
    options.editorContext,
    ...options.page.frames(),
  ];

  await uploadImageRobust({
    page: options.page,
    imagePath,
    contexts,
    imageButtonSelectors: toSelectorArray(options.imageButtonSelector),
    fileInputSelectors: toSelectorArray(options.fileInputSelector),
    platformName: options.platformName,
    label,
    editorFallback:
      options.platform === "tistory" ? options.bodyLocator : undefined,
  });

  if (options.platform === "naver" && altText) {
    const frame = options.editorContext as Frame;
    await setNaverImageAltText(
      options.page,
      frame,
      altText,
      options.platformName,
    );
  }
}

async function attachLinkToLastNaverImage(
  page: Page,
  frame: Frame,
  url: string,
  platformName: string,
): Promise<void> {
  const contexts = [page, frame, ...page.frames()];
  await dismissNaverRightPanelIfVisible(page);

  const images = frame.locator(".se-component.se-image");
  const count = await images.count();
  if (count === 0) return;

  const lastImage = images.nth(count - 1);
  await humanClick(lastImage);
  await humanPause(600);

  const linkSelectors = splitSelectors(EDITOR_SELECTORS.naver.imageLinkButton);
  let linked = false;

  for (const sel of linkSelectors) {
    const btn = frame.locator(sel).first();
    try {
      if ((await btn.count()) === 0 || !(await btn.isVisible())) continue;
      await humanClick(btn);
      await humanPause(500);
      linked = true;
      break;
    } catch {
      // 다음
    }
  }

  if (!linked) {
    console.warn(`[${platformName}] 이미지 링크 버튼 미발견 — ${url}`);
    return;
  }

  await applyLinkInDialog(contexts, url, page, platformName);
}

function resolveBodyImageForSection(
  subThumbnailIndex: number | null,
  prepared: PreparedImageAsset[] | undefined,
  staticImages: ResolvedBodyImage[],
): {
  path: string;
  label: string;
  altText?: string;
  linkUrl?: string;
} | null {
  if (subThumbnailIndex === null) return null;

  const sequence = subThumbnailIndex + 2;
  const preparedBody = prepared?.find((p) => p.sequence === sequence);
  if (preparedBody) {
    return {
      path: preparedBody.absolutePath,
      label: `서브썸네일 ${preparedBody.sequence} (${preparedBody.filename})`,
      altText: preparedBody.altText,
      linkUrl: preparedBody.linkUrl,
    };
  }

  const staticImage = staticImages[subThumbnailIndex];
  if (!staticImage) return null;

  return {
    path: staticImage.absolutePath,
    label: `본문 이미지 ${staticImage.id}`,
    linkUrl: staticImage.linkUrl,
  };
}

/** 1단계: 본문 텍스트만 순서대로 삽입 */
async function insertAllTextNaver(
  options: FillBodyWithImagesOptions,
  intro: string | null,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
): Promise<void> {
  const frame = options.editorContext as Frame;

  await humanClick(options.bodyLocator);
  await focusNaverBodyEnd(frame);

  if (intro) {
    console.log(`[${options.platformName}] 도입부 입력`);
    await dismissNaverRightPanelIfVisible(options.page);
    await appendNaverBody(frame, options.bodyLocator, intro);
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    console.log(
      `[${options.platformName}] 단락 ${i + 1}/${sections.length}${section.h2Title ? `: ${section.h2Title}` : ""}`,
    );
    await dismissNaverRightPanelIfVisible(options.page);
    await appendNaverBody(frame, options.bodyLocator, section.html);
  }
}

async function insertAllTextTistory(
  options: FillBodyWithImagesOptions,
  intro: string | null,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
): Promise<void> {
  await humanClick(options.bodyLocator);
  await humanPause(500);

  if (intro) {
    console.log(`[${options.platformName}] 도입부 입력`);
    await appendHtmlToEditor(options.page, options.bodyLocator, intro);
    await humanPause(400);
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    console.log(
      `[${options.platformName}] 단락 ${i + 1}/${sections.length}${section.h2Title ? `: ${section.h2Title}` : ""}`,
    );
    await appendHtmlToEditor(options.page, options.bodyLocator, section.html);
    await humanPause(400);
  }
}

/** 2단계: 텍스트 삽입 후 이미지를 단락 사이에 삽입 (아래→위 순으로 커서 밀림 방지) */
async function insertImagesNaver(
  options: FillBodyWithImagesOptions,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
  staticImages: ResolvedBodyImage[],
): Promise<void> {
  if (config.publishSkipThumbnail) return;

  const frame = options.editorContext as Frame;
  const prepared = options.preparedImages;
  const thumbMeta = prepared?.find((p) => p.sequence === 1);
  const thumbPath = thumbMeta?.absolutePath ?? options.thumbnailPath;

  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i]!;
    const imageInfo = resolveBodyImageForSection(
      section.subThumbnailIndex,
      prepared,
      staticImages,
    );
    if (!imageInfo) continue;

    await dismissNaverRightPanelIfVisible(options.page);

    if (i === sections.length - 1) {
      await focusNaverBodyEnd(frame);
    } else {
      const focused = await focusNaverBeforeH2(frame, i + 1);
      if (!focused) await focusNaverBodyEnd(frame);
    }

    const before = await countNaverImages(frame);
    await uploadEditorImage(
      options,
      imageInfo.path,
      imageInfo.label,
      imageInfo.altText,
    );
    await waitForNaverImageIncrease(frame, before);

    if (imageInfo.linkUrl) {
      await attachLinkToLastNaverImage(
        options.page,
        frame,
        imageInfo.linkUrl,
        options.platformName,
      );
    }
  }

  if (sections.length > 0) {
    await dismissNaverRightPanelIfVisible(options.page);
    const focused = await focusNaverBeforeH2(frame, 0);
    if (!focused) await focusNaverBodyEnd(frame);

    const beforeMain = await countNaverImages(frame);
    await uploadEditorImage(
      options,
      thumbPath,
      `메인 썸네일${thumbMeta ? ` (${thumbMeta.filename})` : ""}`,
      thumbMeta?.altText,
    );
    await waitForNaverImageIncrease(frame, beforeMain);
  } else if (thumbPath) {
    await dismissNaverRightPanelIfVisible(options.page);
    await focusNaverBodyEnd(frame);
    const beforeMain = await countNaverImages(frame);
    await uploadEditorImage(
      options,
      thumbPath,
      `메인 썸네일${thumbMeta ? ` (${thumbMeta.filename})` : ""}`,
      thumbMeta?.altText,
    );
    await waitForNaverImageIncrease(frame, beforeMain);
  }
}

async function insertImagesTistory(
  options: FillBodyWithImagesOptions,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
  staticImages: ResolvedBodyImage[],
): Promise<void> {
  if (config.publishSkipThumbnail) return;

  const prepared = options.preparedImages;
  const thumbMeta = prepared?.find((p) => p.sequence === 1);
  const thumbPath = thumbMeta?.absolutePath ?? options.thumbnailPath;

  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i]!;
    const imageInfo = resolveBodyImageForSection(
      section.subThumbnailIndex,
      prepared,
      staticImages,
    );
    if (!imageInfo) continue;

    if (i === sections.length - 1) {
      await focusEditorEnd(options.bodyLocator);
    } else {
      const focused = await focusBeforeH2InEditor(options.bodyLocator, i + 1);
      if (!focused) await humanPause(300);
    }

    await uploadEditorImage(options, imageInfo.path, imageInfo.label);
    await humanPause(1200);
  }

  if (sections.length > 0) {
    const focused = await focusBeforeH2InEditor(options.bodyLocator, 0);
    if (!focused) await humanPause(300);
    await uploadEditorImage(options, thumbPath, "메인 썸네일");
    await humanPause(1200);
  } else if (thumbPath) {
    await uploadEditorImage(options, thumbPath, "메인 썸네일");
    await humanPause(1200);
  }
}

/**
 * 본문 텍스트를 먼저 순서대로 삽입한 뒤,
 * 메인·서브 썸네일을 단락 사이에 삽입합니다.
 */
export async function fillBodyWithImages(
  options: FillBodyWithImagesOptions,
): Promise<void> {
  const staticImages = loadBodyImages();
  const { intro, sections } = splitHtmlForPublishing(options.htmlBody);

  console.log(
    `[${options.platformName}] 1단계: 본문 텍스트 삽입 (도입부 ${intro ? "있음" : "없음"}, h2 ${sections.length}개)`,
  );

  if (options.platform === "naver") {
    await insertAllTextNaver(options, intro, sections);
    console.log(`[${options.platformName}] 2단계: 썸네일 이미지 단락 사이 삽입`);
    await insertImagesNaver(options, sections, staticImages);
    return;
  }

  await insertAllTextTistory(options, intro, sections);
  console.log(`[${options.platformName}] 2단계: 썸네일 이미지 단락 사이 삽입`);
  await insertImagesTistory(options, sections, staticImages);
}
