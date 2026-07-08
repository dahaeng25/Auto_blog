import { config, getEnabledPlatforms } from "../config/index.js";
import { jobStore } from "./api/job-store.js";
import { ContentPipeline } from "./content/content-pipeline.js";
import { TopicRepository } from "./content/farming/topic-repository.js";
import type { ArticleDraft } from "./content/types.js";
import { ensureWritableDirs } from "./fs/ensure-writable-dirs.js";
import { notifyError, notifySuccess } from "./monitoring/discord-notifier.js";
import { logger } from "./monitoring/logger.js";
import { persistPublishedPosts } from "./content/seo/persist-published-posts.js";
import { assertOrchestrationReady } from "./pipeline/preflight.js";
import { prepareNaverImageSet } from "./publishing/images/prepare-naver-images.js";
import {
  buildKeywordSlug,
  buildTopLabelFromKeywords,
  extractMainKeywords,
} from "./publishing/images/keyword-slug.js";
import { PublishPipeline } from "./publishing/publish-pipeline.js";
import type { PublishResult } from "./publishing/types.js";
import { ThumbnailRenderer } from "./thumbnail/thumbnail-renderer.js";
import { generateSubThumbnails } from "./thumbnail/generate-sub-thumbnails.js";
import {
  refreshThumbnailTexts,
  thumbnailMatchesTopic,
} from "./thumbnail/resolve-thumbnail-texts.js";

export interface OrchestrationOptions {
  /** 실행 시 지정한 블로그 주제/키워드 */
  blogTopic?: string;
  /** 실행 시 지정한 지역(도·광역시). 비우면 .env/blog-region.txt 폴백 */
  blogRegion?: string;
  /** 실행 트리거 식별자 (web, cron, vercel-cron 등) */
  trigger?: string;
}

export interface OrchestrationResult {
  draft: ArticleDraft;
  thumbnailPath: string;
  publishResults: PublishResult[];
}

/** 동시 실행 방지 락 */
let isRunning = false;

export function isPipelineRunning(): boolean {
  return isRunning;
}

/**
 * Phase 2 → 3 → 4 전체 오케스트레이션.
 * 성공/실패 시 Discord Webhook으로 알림을 전송합니다.
 */
export async function runOrchestration(
  options: OrchestrationOptions = {},
): Promise<OrchestrationResult> {
  if (isRunning) {
    const msg = "이전 파이프라인이 아직 실행 중입니다. 이번 실행을 건너뜁니다.";
    logger.warn(msg);
    throw new Error(msg);
  }

  isRunning = true;
  const trigger = options.trigger ?? "manual";
  const repo = new TopicRepository();
  const contentPipeline = new ContentPipeline(repo);
  const thumbnailRenderer = new ThumbnailRenderer();
  const publishPipeline = new PublishPipeline();

  logger.info("═══ 블로그 오케스트레이션 시작 ═══");
  const activeTopic = options.blogTopic ?? config.blogTopic;

  try {
    await assertOrchestrationReady({ blogTopic: options.blogTopic });
    await ensureWritableDirs();
    await jobStore.markRunning(trigger);

    const activeRegion = options.blogRegion?.trim() || config.blogRegion || "";
    logger.info(
      `설정: MODE=${config.contentMode}, TOPIC=${activeTopic || "(rss)"}, ` +
        `REGION=${activeRegion || "(default/file)"}, ` +
        `LLM=${config.llmProvider}, DRY_RUN=${config.publishDryRun}, ` +
        `SKIP_THUMBNAIL=${config.publishSkipThumbnail}`,
    );

    // Phase 2: 콘텐츠 생성
    const draft = await contentPipeline.run({
      blogTopic: options.blogTopic,
      blogRegion: options.blogRegion,
    });

    // Phase 3: 썸네일 렌더링 (네이버 샘플 스타일 시 키워드1.png 파일명)
    logger.info("Phase 3: 썸네일 생성");
    const keywords = extractMainKeywords(activeTopic, draft.title);
    const keywordSlug = buildKeywordSlug(keywords);
    const enabledPlatforms = getEnabledPlatforms();
    const needsPreparedImages =
      enabledPlatforms.includes("naver") ||
      enabledPlatforms.includes("tistory");

    const topLabel =
      draft.thumbnailTopLabel?.trim() ||
      buildTopLabelFromKeywords(keywords);

    let thumbnailTopLabel = topLabel;
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

    // Phase 4: 네이버 + 티스토리 퍼블리싱
    const publishResults = await publishPipeline.run({
      title: draft.title,
      htmlBody: draft.htmlBody,
      thumbnailPath: naverImages?.thumbnail.absolutePath ?? thumbnailPath,
      blogTopic: activeTopic,
      naverImages,
    });

    if (!config.publishDryRun) {
      const allPublished = publishResults.every((r) => r.postUrl);
      if (allPublished) {
        await repo.updateStatus(draft.topicId, "published");
        logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);

        await persistPublishedPosts({
          topicId: draft.topicId,
          title: draft.title,
          keywords: activeTopic,
          results: publishResults,
        });
      } else {
        logger.warn("일부 플랫폼 발행 URL 없음 — 상태는 drafted 유지");
      }
    } else {
      logger.info("DRY-RUN 모드 — 발행 생략, 상태는 drafted 유지");
    }

    await notifySuccess(draft.title, publishResults);
    await jobStore.markSuccess(draft.title, thumbnailPath);

    logger.info("═══ 블로그 오케스트레이션 완료 ═══");

    return { draft, thumbnailPath, publishResults };
  } catch (error) {
    const stage =
      error instanceof Error && "pipelineStage" in error
        ? String((error as Error & { pipelineStage?: string }).pipelineStage)
        : "orchestration";

    logger.error(
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }

    try {
      await notifyError(error, { stage });
    } catch (notifyErr) {
      logger.error(
        `Discord 알림 전송 실패: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error);
    await jobStore.markError(errorMessage).catch(() => {});

    throw error;
  } finally {
    contentPipeline.close();
    repo.close();
    isRunning = false;
  }
}
