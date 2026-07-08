import fs from "node:fs/promises";
import { config, getEnabledPlatforms } from "../../config/index.js";
import type { ArticleDraft } from "../content/types.js";
import { prepareNaverImageSet } from "../publishing/images/prepare-naver-images.js";
import {
  buildKeywordSlug,
  buildSubThumbnailFilename,
  buildTopLabelFromKeywords,
  extractH2Titles,
  extractMainKeywords,
} from "../publishing/images/keyword-slug.js";
import { PublishPipeline } from "../publishing/publish-pipeline.js";
import type { PublishResult } from "../publishing/types.js";
import type { NaverImageSet } from "../publishing/images/prepare-naver-images.js";
import { ThumbnailRenderer } from "../thumbnail/thumbnail-renderer.js";
import { generateSubThumbnails } from "../thumbnail/generate-sub-thumbnails.js";
import {
  refreshThumbnailTexts,
  thumbnailMatchesTopic,
} from "../thumbnail/resolve-thumbnail-texts.js";
import { logger } from "../monitoring/logger.js";

export interface ThumbnailPhaseResult {
  thumbnailPath: string;
  naverImages?: NaverImageSet;
}

/** Phase 3: 썸네일 + 네이버/티스토리용 이미지 세트 준비 */
export async function runThumbnailPhase(
  draft: ArticleDraft,
  activeTopic: string,
): Promise<ThumbnailPhaseResult> {
  logger.info("Phase 3: 썸네일 생성");

  const keywords = extractMainKeywords(activeTopic, draft.title);
  const keywordSlug = buildKeywordSlug(keywords);
  const enabledPlatforms = getEnabledPlatforms();
  const needsPreparedImages =
    enabledPlatforms.includes("naver") ||
    enabledPlatforms.includes("tistory");

  let thumbnailTopLabel =
    draft.thumbnailTopLabel?.trim() ||
    buildTopLabelFromKeywords(keywords);
  let thumbnailText = draft.thumbnailText;

  if (
    activeTopic &&
    !thumbnailMatchesTopic(
      activeTopic,
      draft.title,
      thumbnailTopLabel,
      thumbnailText,
    )
  ) {
    logger.info("썸네일 문구를 키워드·제목에 맞게 재생성합니다.");
    const refreshed = await refreshThumbnailTexts(activeTopic, draft.title);
    thumbnailTopLabel = refreshed.topLabel;
    thumbnailText = refreshed.mainText;
  }

  const thumbnailRenderer = new ThumbnailRenderer();
  const thumbnailPath = await thumbnailRenderer.render({
    text: thumbnailText,
    topLabel: thumbnailTopLabel,
    keywords,
    keywordSlug,
    ...(needsPreparedImages ? { outputFilename: `${keywordSlug}1.png` } : {}),
  });

  const subThumbnails = await generateSubThumbnails({
    htmlBody: draft.htmlBody,
    keywords,
    keywordSlug,
    title: draft.title,
  });

  let naverImages;
  if (needsPreparedImages) {
    naverImages = await prepareNaverImageSet({
      thumbnailPath,
      htmlBody: draft.htmlBody,
      title: draft.title,
      blogTopic: activeTopic,
      subThumbnails,
    });
  }

  return { thumbnailPath, naverImages };
}

/** CLI publish-step 과 동일하게 DB 원고 + 저장된 썸네일로 이미지 세트 재구성 */
export async function preparePublishImagesFromSavedThumbnail(
  draft: ArticleDraft,
  activeTopic: string,
  savedThumbnailPath: string,
  subThumbnailPaths: string[] = [],
): Promise<{ thumbnailPath: string; naverImages?: NaverImageSet }> {
  const enabledPlatforms = getEnabledPlatforms();
  const needsPreparedImages =
    enabledPlatforms.includes("naver") ||
    enabledPlatforms.includes("tistory");

  if (!needsPreparedImages) {
    return { thumbnailPath: savedThumbnailPath };
  }

  const keywordList = extractMainKeywords(activeTopic, draft.title);
  const h2Titles = extractH2Titles(draft.htmlBody);
  const subThumbnails = subThumbnailPaths.map((p, i) => ({
    path: p,
    sectionTitle: h2Titles[i] ?? `단락 ${i + 1}`,
    sequence: i + 2,
    filename: buildSubThumbnailFilename(draft.title, i + 2),
  }));

  const naverImages = await prepareNaverImageSet({
    thumbnailPath: savedThumbnailPath,
    htmlBody: draft.htmlBody,
    title: draft.title,
    blogTopic: activeTopic,
    subThumbnails: subThumbnails.length > 0 ? subThumbnails : undefined,
  });

  return {
    thumbnailPath: naverImages.thumbnail.absolutePath,
    naverImages,
  };
}

/** Phase 4: 퍼블리싱 */
export async function runPublishPhase(
  draft: ArticleDraft,
  activeTopic: string,
  thumbnailPath: string,
  naverImages?: NaverImageSet,
): Promise<PublishResult[]> {
  const publishPipeline = new PublishPipeline();
  return publishPipeline.run({
    title: draft.title,
    htmlBody: draft.htmlBody,
    thumbnailPath,
    blogTopic: activeTopic,
    naverImages,
  });
}

export async function assertThumbnailFile(thumbnailPath: string): Promise<void> {
  try {
    await fs.access(thumbnailPath);
  } catch {
    throw new Error(
      `썸네일 파일을 찾을 수 없습니다: ${thumbnailPath}\n` +
        "먼저 썸네일 단계를 실행하세요.",
    );
  }
}

export function resolveActiveTopic(
  blogTopic: string | undefined,
  draft: ArticleDraft,
): string {
  return (
    blogTopic?.trim() ||
    config.blogTopic ||
    draft.sourceTopic.title ||
    ""
  );
}
