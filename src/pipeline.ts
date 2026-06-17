import { config } from "../config/index.js";
import { jobStore } from "./api/job-store.js";
import { ContentPipeline } from "./content/content-pipeline.js";
import { TopicRepository } from "./content/farming/topic-repository.js";
import type { ArticleDraft } from "./content/types.js";
import { notifyError, notifySuccess } from "./monitoring/discord-notifier.js";
import { logger } from "./monitoring/logger.js";
import { PublishPipeline } from "./publishing/publish-pipeline.js";
import type { PublishResult } from "./publishing/types.js";
import { ThumbnailRenderer } from "./thumbnail/thumbnail-renderer.js";

export interface OrchestrationResult {
  draft: ArticleDraft;
  thumbnailPath: string;
  publishResults: PublishResult[];
}

export interface OrchestrationOptions {
  /** 실행 출처 (web, cron, cli 등) */
  trigger?: string;
}

export async function isPipelineRunning(): Promise<boolean> {
  return jobStore.isRunning();
}

/**
 * Phase 2 → 3 → 4 전체 오케스트레이션.
 * 성공/실패 시 Discord Webhook으로 알림을 전송합니다.
 */
export async function runOrchestration(
  options: OrchestrationOptions = {},
): Promise<OrchestrationResult> {
  const trigger = options.trigger ?? "manual";

  if (await jobStore.isRunning()) {
    const msg = "이전 파이프라인이 아직 실행 중입니다. 이번 실행을 건너뜁니다.";
    logger.warn(msg);
    throw new Error(msg);
  }

  await jobStore.markRunning(trigger);
  const repo = new TopicRepository();
  const contentPipeline = new ContentPipeline(repo);
  const thumbnailRenderer = new ThumbnailRenderer();
  const publishPipeline = new PublishPipeline();

  logger.info("═══ 블로그 오케스트레이션 시작 ═══");

  try {
    const draft = await contentPipeline.run();

    logger.info("Phase 3: 썸네일 생성");
    const thumbnailPath = await thumbnailRenderer.render({
      text: draft.thumbnailText,
      subtitle: draft.title,
    });

    const publishResults = await publishPipeline.run({
      title: draft.title,
      htmlBody: draft.htmlBody,
      thumbnailPath,
    });

    if (!config.publishDryRun) {
      await repo.updateStatus(draft.topicId, "published");
      logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);
    } else {
      logger.info("DRY-RUN 모드 — 주제 상태는 drafted 유지");
    }

    await notifySuccess(draft.title, publishResults);
    await jobStore.markSuccess(draft.title, thumbnailPath);

    logger.info("═══ 블로그 오케스트레이션 완료 ═══");

    return { draft, thumbnailPath, publishResults };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await jobStore.markError(message);
    logger.error(message);
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
    if (await jobStore.isRunning()) {
      await jobStore.markError("파이프라인이 예기치 않게 종료되었습니다.");
    }
  }
}
