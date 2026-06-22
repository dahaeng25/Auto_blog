import type { Frame, Locator, Page } from "playwright";
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";
import { config } from "../../../config/index.js";
import { appendNaverBody, focusNaverBodyEnd } from "../utils/naver-editor.js";
import { pasteHtmlToEditor } from "../utils/editor-paste.js";
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
  /** 네이버 — 키워드 파일명·메타가 적용된 이미지 */
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

/** 네이버: 마지막 업로드 이미지에 링크 연결 */
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

/** 티스토리: HTML 링크 블록으로 대체 */
async function attachLinkToLastTistoryImage(
  page: Page,
  editorLocator: Locator,
  url: string,
  platformName: string,
): Promise<void> {
  const linkHtml = `<p><a href="${url}" target="_blank" rel="noopener">자세히 보기</a></p>`;
  await pasteHtmlToEditor(page, editorLocator, linkHtml);
  console.log(`[${platformName}] 이미지 하단 링크 문단 삽입: ${url}`);
}

async function insertNaverSection(
  frame: Frame,
  bodyLocator: Locator,
  html: string,
): Promise<void> {
  await focusNaverBodyEnd(frame);
  await appendNaverBody(frame, bodyLocator, html);
  await humanPause(400);
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

async function fillNaverBodyWithImages(
  options: FillBodyWithImagesOptions,
  intro: string | null,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
  staticImages: ResolvedBodyImage[],
): Promise<void> {
  const frame = options.editorContext as Frame;
  const prepared = options.preparedImages;
  const thumbMeta = prepared?.find((p) => p.sequence === 1);

  await humanClick(options.bodyLocator);
  await focusNaverBodyEnd(frame);

  if (!config.publishSkipThumbnail) {
    await dismissNaverRightPanelIfVisible(options.page);
    const beforeThumb = await countNaverImages(frame);
    const thumbPath = thumbMeta?.absolutePath ?? options.thumbnailPath;
    await uploadEditorImage(
      options,
      thumbPath,
      `메인 썸네일${thumbMeta ? ` (${thumbMeta.filename})` : ""}`,
      thumbMeta?.altText,
    );
    await waitForNaverImageIncrease(frame, beforeThumb);
    await dismissNaverRightPanelIfVisible(options.page);
  }

  if (intro) {
    console.log(`[${options.platformName}] 도입부 입력`);
    await dismissNaverRightPanelIfVisible(options.page);
    await insertNaverSection(frame, options.bodyLocator, intro);
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    console.log(
      `[${options.platformName}] 단락 ${i + 1}/${sections.length}${section.h2Title ? `: ${section.h2Title}` : ""}`,
    );

    const imageInfo = resolveBodyImageForSection(
      section.subThumbnailIndex,
      prepared,
      staticImages,
    );

    if (imageInfo) {
      await dismissNaverRightPanelIfVisible(options.page);
      const before = await countNaverImages(frame);
      await uploadEditorImage(
        options,
        imageInfo.path,
        imageInfo.label,
        imageInfo.altText,
      );
      await waitForNaverImageIncrease(frame, before);
      await dismissNaverRightPanelIfVisible(options.page);
    }

    await dismissNaverRightPanelIfVisible(options.page);
    await insertNaverSection(frame, options.bodyLocator, section.html);

    if (imageInfo?.linkUrl) {
      await attachLinkToLastNaverImage(
        options.page,
        frame,
        imageInfo.linkUrl,
        options.platformName,
      );
    }
  }
}

async function fillTistoryBodyWithImages(
  options: FillBodyWithImagesOptions,
  intro: string | null,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
  staticImages: ResolvedBodyImage[],
): Promise<void> {
  await humanClick(options.bodyLocator);
  await humanPause(1000);

  if (!config.publishSkipThumbnail) {
    await uploadEditorImage(options, options.thumbnailPath, "메인 썸네일");
    await humanPause(1000);
  }

  if (intro) {
    await pasteHtmlToEditor(options.page, options.bodyLocator, intro);
    await humanPause(500);
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const imageInfo = resolveBodyImageForSection(
      section.subThumbnailIndex,
      options.preparedImages,
      staticImages,
    );

    if (imageInfo) {
      await uploadEditorImage(options, imageInfo.path, imageInfo.label);
      await humanPause(1500);
    }

    await pasteHtmlToEditor(options.page, options.bodyLocator, section.html);
    await humanPause(500);

    if (imageInfo?.linkUrl) {
      await attachLinkToLastTistoryImage(
        options.page,
        options.bodyLocator,
        imageInfo.linkUrl,
        options.platformName,
      );
    }
  }
}

/**
 * 메인 썸네일 + 단락별 서브썸네일(상단 배치) + 본문 HTML 순차 삽입
 */
export async function fillBodyWithImages(
  options: FillBodyWithImagesOptions,
): Promise<void> {
  const staticImages = loadBodyImages();
  const { intro, sections } = splitHtmlForPublishing(options.htmlBody);

  console.log(
    `[${options.platformName}] 도입부 ${intro ? "있음" : "없음"}, h2 단락 ${sections.length}개`,
  );

  if (options.platform === "naver") {
    await fillNaverBodyWithImages(options, intro, sections, staticImages);
    return;
  }

  await fillTistoryBodyWithImages(options, intro, sections, staticImages);
}
