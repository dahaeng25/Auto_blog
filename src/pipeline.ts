import { config } from "../config/index.js";
import { ContentPipeline } from "./content/content-pipeline.js";
import { TopicRepository } from "./content/farming/topic-repository.js";
import type { ArticleDraft } from "./content/types.js";
import { notifyError, notifySuccess } from "./monitoring/discord-notifier.js";
import { logger } from "./monitoring/logger.js";
import { PublishPipeline } from "./publishing/publish-pipeline.js";
import type { PublishResult } from "./publishing/types.js";
import { ThumbnailRenderer } from "./thumbnail/thumbnail-renderer.js";

export interface OrchestrationOptions {
  /** 실행 시 지정한 블로그 주제/키워드 */
  blogTopic?: string;
}

export interface OrchestrationResult {
  draft: ArticleDraft;
  thumbnailPath: string;
  publishResults: PublishResult[];
}

/** 동시 실행 방지 락 */
let isRunning = false;

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
  const repo = new TopicRepository();
  const contentPipeline = new ContentPipeline(repo);
  const thumbnailRenderer = new ThumbnailRenderer();
  const publishPipeline = new PublishPipeline();

  logger.info("═══ 블로그 오케스트레이션 시작 ═══");
  const activeTopic = options.blogTopic ?? config.blogTopic;

  logger.info(
    `설정: MODE=${config.contentMode}, TOPIC=${activeTopic || "(rss)"}, ` +
      `LLM=${config.llmProvider}, DRY_RUN=${config.publishDryRun}, ` +
      `SKIP_THUMBNAIL=${config.publishSkipThumbnail}`,
  );

  try {
    // Phase 2: 콘텐츠 생성
    const draft = await contentPipeline.run({ blogTopic: options.blogTopic });

    // Phase 3: 썸네일 렌더링
    logger.info("Phase 3: 썸네일 생성");
    const thumbnailPath = await thumbnailRenderer.render({
      text: draft.thumbnailText,
      ...(config.thumbnailShowSubtitle ? { subtitle: draft.title } : {}),
    });

    // Phase 4: 네이버 + 티스토리 퍼블리싱
    const publishResults = await publishPipeline.run({
      title: draft.title,
      htmlBody: draft.htmlBody,
      thumbnailPath,
    });

    if (!config.publishDryRun) {
      const allPublished = publishResults.every((r) => r.postUrl);
      if (allPublished) {
        repo.updateStatus(draft.topicId, "published");
        logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);
      } else {
        logger.warn("일부 플랫폼 발행 URL 없음 — 상태는 drafted 유지");
      }
    } else {
      logger.info("DRY-RUN 모드 — 발행 생략, 상태는 drafted 유지");
    }

    await notifySuccess(draft.title, publishResults);

    logger.info("═══ 블로그 오케스트레이션 완료 ═══");

    return { draft, thumbnailPath, publishResults };
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }

    try {
      await notifyError(error);
    } catch (notifyErr) {
      logger.error(
        `Discord 알림 전송 실패: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
      );
    }

    throw error;
  } finally {
    contentPipeline.close();
    repo.close();
    isRunning = false;
  }
}
