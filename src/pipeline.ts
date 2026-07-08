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
import {
  resolveActiveTopic,
  runPublishPhase,
  runThumbnailPhase,
} from "./pipeline/phases.js";
import type { PublishResult } from "./publishing/types.js";
import {
  acquirePipelineLock,
  isPipelineRunning as checkPipelineRunning,
  releasePipelineLock,
  type OrchestrationOptions,
} from "./pipeline/lock.js";

export type { OrchestrationOptions } from "./pipeline/lock.js";
export { runPipelineStep } from "./pipeline/step-runner.js";
export type { PipelineStep, StepRunOptions, StepRunResult } from "./pipeline/step-runner.js";

export interface OrchestrationResult {
  draft: ArticleDraft;
  thumbnailPath: string;
  publishResults: PublishResult[];
}

export function isPipelineRunning(): boolean {
  return checkPipelineRunning();
}

/**
 * Phase 2 → 3 → 4 전체 오케스트레이션.
 * 성공/실패 시 Discord Webhook으로 알림을 전송합니다.
 */
export async function runOrchestration(
  options: OrchestrationOptions = {},
): Promise<OrchestrationResult> {
  if (!acquirePipelineLock()) {
    const msg = "이전 파이프라인이 아직 실행 중입니다. 이번 실행을 건너뜁니다.";
    logger.warn(msg);
    throw new Error(msg);
  }

  const trigger = options.trigger ?? "manual";
  const repo = new TopicRepository();
  const contentPipeline = new ContentPipeline(repo);

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

    const draft = await contentPipeline.run({
      blogTopic: options.blogTopic,
      blogRegion: options.blogRegion,
    });

    const topic = resolveActiveTopic(options.blogTopic, draft);
    const { thumbnailPath, naverImages } = await runThumbnailPhase(draft, topic);
    await jobStore
      .updateArtifacts({ lastTitle: draft.title, lastThumbnailPath: thumbnailPath })
      .catch(() => {});

    const publishResults = await runPublishPhase(
      draft,
      topic,
      naverImages?.thumbnail.absolutePath ?? thumbnailPath,
      naverImages,
    );

    if (!config.publishDryRun) {
      const allPublished = publishResults.every((r) => r.postUrl);
      if (allPublished) {
        await repo.updateStatus(draft.topicId, "published");
        logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);

        await persistPublishedPosts({
          topicId: draft.topicId,
          title: draft.title,
          keywords: topic,
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
    releasePipelineLock();
  }
}
