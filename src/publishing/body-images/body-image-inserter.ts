import type { Frame, Locator, Page } from "playwright";
import { config } from "../../../config/index.js";
import {
  appendNaverBody,
  focusNaverBodyEnd,
} from "../utils/naver-editor.js";
import { focusEditorEnd } from "../utils/editor-cursor.js";
import { appendHtmlToTistoryEditor } from "../utils/editor-paste.js";
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
import { EDITOR_SELECTORS } from "../../../config/editor-selectors.js";

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
  preparedImages?: PreparedImageAsset[];
}

type PublishBlock =
  | { kind: "html"; html: string; label: string }
  | {
      kind: "image";
      path: string;
      label: string;
      altText?: string;
      linkUrl?: string;
    };

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

/** 발행 순서: 도입부 → 메인썸네일 → (서브썸네일 → 단락) 반복 */
function buildPublishBlocks(
  intro: string | null,
  sections: ReturnType<typeof splitHtmlForPublishing>["sections"],
  options: FillBodyWithImagesOptions,
  staticImages: ResolvedBodyImage[],
): PublishBlock[] {
  const blocks: PublishBlock[] = [];
  const prepared = options.preparedImages;
  const thumbMeta = prepared?.find((p) => p.sequence === 1);
  const thumbPath = thumbMeta?.absolutePath ?? options.thumbnailPath;

  if (intro) {
    blocks.push({ kind: "html", html: intro, label: "도입부" });
  }

  if (!config.publishSkipThumbnail && thumbPath) {
    blocks.push({
      kind: "image",
      path: thumbPath,
      label: `메인 썸네일${thumbMeta ? ` (${thumbMeta.filename})` : ""}`,
      altText: thumbMeta?.altText,
    });
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const imageInfo = resolveBodyImageForSection(
      section.subThumbnailIndex,
      prepared,
      staticImages,
    );

    if (imageInfo) {
      blocks.push({
        kind: "image",
        path: imageInfo.path,
        label: imageInfo.label,
        altText: imageInfo.altText,
        linkUrl: imageInfo.linkUrl,
      });
    }

    blocks.push({
      kind: "html",
      html: section.html,
      label: section.h2Title
        ? `단락 ${i + 1}: ${section.h2Title}`
        : `단락 ${i + 1}`,
    });
  }

  return blocks;
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
  for (const sel of linkSelectors) {
    const btn = frame.locator(sel).first();
    try {
      if ((await btn.count()) === 0 || !(await btn.isVisible())) continue;
      await humanClick(btn);
      await humanPause(500);
      await applyLinkInDialog(contexts, url, page, platformName);
      return;
    } catch {
      // 다음
    }
  }
}

async function runNaverBlocks(
  options: FillBodyWithImagesOptions,
  blocks: PublishBlock[],
): Promise<void> {
  const frame = options.editorContext as Frame;

  await humanClick(options.bodyLocator);
  await focusNaverBodyEnd(frame);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    console.log(`[${options.platformName}] ${i + 1}/${blocks.length} — ${block.label}`);

    if (block.kind === "html") {
      await dismissNaverRightPanelIfVisible(options.page);
      await appendNaverBody(frame, options.bodyLocator, block.html);
      await humanPause(500);
      continue;
    }

    await dismissNaverRightPanelIfVisible(options.page);
    await focusNaverBodyEnd(frame);
    const before = await countNaverImages(frame);
    await uploadEditorImage(options, block.path, block.label, block.altText);
    await waitForNaverImageIncrease(frame, before);

    if (block.linkUrl) {
      await attachLinkToLastNaverImage(
        options.page,
        frame,
        block.linkUrl,
        options.platformName,
      );
    }
  }
}

async function runTistoryBlocks(
  options: FillBodyWithImagesOptions,
  blocks: PublishBlock[],
): Promise<void> {
  await humanClick(options.bodyLocator);
  await humanPause(400);

  const prepared = options.preparedImages;
  const thumbMeta = prepared?.find((p) => p.sequence === 1);
  const thumbPath = thumbMeta?.absolutePath ?? options.thumbnailPath;

  // 1) 메인 썸네일 1장만 (서브썸네일·단락별 이미지 없음)
  if (!config.publishSkipThumbnail && thumbPath) {
    console.log(`[${options.platformName}] 메인 썸네일 삽입`);
    await uploadEditorImage(
      options,
      thumbPath,
      `메인 썸네일${thumbMeta ? ` (${thumbMeta.filename})` : ""}`,
    );
    await humanPause(1200);
    await focusEditorEnd(options.bodyLocator);
  }

  // 2) 스타일 적용된 본문 HTML 전체를 한 번에 삽입 (순서 뒤집힘 방지)
  const fullHtml = options.htmlBody.trim();
  if (fullHtml) {
    const sectionCount = blocks.filter((b) => b.kind === "html").length;
    console.log(
      `[${options.platformName}] 본문 HTML 일괄 삽입 (섹션 ${sectionCount}개 분량)`,
    );
    await focusEditorEnd(options.bodyLocator);
    await appendHtmlToTistoryEditor(options.page, options.bodyLocator, fullHtml);
    await humanPause(800);
  }
}

/**
 * 도입부 → 메인썸네일 → (서브썸네일 → 단락) 순서로 위에서 아래로 삽입
 */
export async function fillBodyWithImages(
  options: FillBodyWithImagesOptions,
): Promise<void> {
  const staticImages = loadBodyImages();
  const { intro, sections } = splitHtmlForPublishing(options.htmlBody);
  const blocks = buildPublishBlocks(intro, sections, options, staticImages);

  console.log(
    `[${options.platformName}] 본문 삽입 ${blocks.length}블록 (도입부 ${intro ? "O" : "X"}, h2 ${sections.length}개)`,
  );

  if (options.platform === "naver") {
    await runNaverBlocks(options, blocks);
    return;
  }

  await runTistoryBlocks(options, blocks);
}
