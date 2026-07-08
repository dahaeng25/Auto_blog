import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";
import { jobStore } from "../api/job-store.js";
import { FarmingAgent } from "../content/agents/farming-agent.js";
import { ContentPipeline } from "../content/content-pipeline.js";
import { TopicRepository } from "../content/farming/topic-repository.js";
import type { ArticleDraft } from "../content/types.js";
import { exportDraftWorkspace } from "../cli/draft-workspace.js";
import { ensureWritableDirs } from "../fs/ensure-writable-dirs.js";
import { notifyError, notifySuccess } from "../monitoring/discord-notifier.js";
import { logger } from "../monitoring/logger.js";
import { persistPublishedPosts } from "../content/seo/persist-published-posts.js";
import { assertOrchestrationReady } from "./preflight.js";
import {
  assertThumbnailFile,
  preparePublishImagesFromSavedThumbnail,
  resolveActiveTopic,
  runPublishPhase,
  runThumbnailPhase,
} from "./phases.js";
import {
  acquirePipelineLock,
  releasePipelineLock,
  type OrchestrationOptions,
} from "./lock.js";

export type PipelineStep = "collect" | "content" | "thumbnail" | "publish";

export interface StepRunOptions extends OrchestrationOptions {
  step: PipelineStep;
}

export interface StepRunResult {
  step: PipelineStep;
  title?: string;
  thumbnailPath?: string;
  topicTitle?: string;
}

async function handleStepError(
  error: unknown,
  step: PipelineStep,
): Promise<never> {
  const stage =
    error instanceof Error && "pipelineStage" in error
      ? String((error as Error & { pipelineStage?: string }).pipelineStage)
      : step;

  logger.error(error instanceof Error ? error.message : String(error));
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

  const errorMessage = error instanceof Error ? error.message : String(error);
  await jobStore.markError(errorMessage).catch(() => {});
  throw error;
}

async function loadLatestDraft(repo: TopicRepository): Promise<ArticleDraft> {
  const article = await repo.getLatestArticle();
  if (!article) {
    throw new Error(
      "저장된 원고가 없습니다. 먼저 [생성] 단계를 실행하세요.",
    );
  }
  const { id: _id, ...draft } = article;
  return draft;
}

async function resolveThumbnailPath(): Promise<string> {
  const job = await jobStore.get();
  if (job.lastThumbnailPath) {
    try {
      await assertThumbnailFile(job.lastThumbnailPath);
      return job.lastThumbnailPath;
    } catch {
      logger.warn(
        `job_store 썸네일 경로 무효 — thumbnails 폴더에서 최신 파일 탐색`,
      );
    }
  }

  try {
    const entries = await fs.readdir(config.thumbnailsDir);
    const pngs = entries.filter((name) => name.toLowerCase().endsWith(".png"));
    if (pngs.length > 0) {
      const withStats = await Promise.all(
        pngs.map(async (name) => {
          const fullPath = path.join(config.thumbnailsDir, name);
          const stat = await fs.stat(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        }),
      );
      withStats.sort((a, b) => b.mtime - a.mtime);
      return withStats[0]!.fullPath;
    }
  } catch {
    // thumbnails 폴더 없음
  }

  throw new Error(
    "썸네일이 없습니다. 먼저 [썸네일] 단계를 실행하세요.",
  );
}

/**
 * 대시보드 단계별 실행 — collect / content / thumbnail / publish
 */
export async function runPipelineStep(
  options: StepRunOptions,
): Promise<StepRunResult> {
  if (!acquirePipelineLock()) {
    const msg = "이전 파이프라인이 아직 실행 중입니다. 이번 실행을 건너뜁니다.";
    logger.warn(msg);
    throw new Error(msg);
  }

  const trigger = options.trigger ?? `web-step:${options.step}`;
  const repo = new TopicRepository();
  const contentPipeline = new ContentPipeline(repo);

  logger.info(`═══ 파이프라인 단계 실행: ${options.step} ═══`);

  try {
    await ensureWritableDirs();
    await jobStore.markRunning(trigger);

    if (options.step === "publish") {
      await assertOrchestrationReady({ blogTopic: options.blogTopic });
    } else if (options.step === "content") {
      await assertOrchestrationReady({ blogTopic: options.blogTopic });
    }

    switch (options.step) {
      case "collect": {
        if (config.contentMode === "gems") {
          throw new Error(
            "gems 모드에서는 RSS 수집 단계가 필요하지 않습니다.",
          );
        }

        const farmingAgent = new FarmingAgent(repo);
        const { topic } = await farmingAgent.run();
        await jobStore.markSuccess(topic.title);
        return { step: "collect", topicTitle: topic.title };
      }

      case "content": {
        const draft = await contentPipeline.run({
          blogTopic: options.blogTopic,
          blogRegion: options.blogRegion,
          forceRegenerate: true,
        });

        const activeTopic = resolveActiveTopic(options.blogTopic, draft);
        await exportDraftWorkspace(draft, activeTopic, undefined).catch(
          (err) => {
            logger.warn(
              `워크스페이스 저장 생략: ${err instanceof Error ? err.message : err}`,
            );
          },
        );

        await jobStore.markSuccess(draft.title);
        return { step: "content", title: draft.title };
      }

      case "thumbnail": {
        const draft = await loadLatestDraft(repo);
        const activeTopic = resolveActiveTopic(options.blogTopic, draft);
        const { thumbnailPath } = await runThumbnailPhase(draft, activeTopic);
        await jobStore.updateArtifacts({
          lastTitle: draft.title,
          lastThumbnailPath: thumbnailPath,
        });
        await jobStore.markSuccess(draft.title, thumbnailPath);
        return { step: "thumbnail", title: draft.title, thumbnailPath };
      }

      case "publish": {
        const draft = await loadLatestDraft(repo);
        const activeTopic = resolveActiveTopic(options.blogTopic, draft);
        const savedThumbnailPath = await resolveThumbnailPath();

        const { thumbnailPath, naverImages } =
          await preparePublishImagesFromSavedThumbnail(
            draft,
            activeTopic,
            savedThumbnailPath,
          );

        const publishResults = await runPublishPhase(
          draft,
          activeTopic,
          thumbnailPath,
          naverImages,
        );

        if (!config.publishDryRun) {
          const allPublished = publishResults.every((r) => r.postUrl);
          if (allPublished) {
            await repo.updateStatus(draft.topicId, "published");
            await persistPublishedPosts({
              topicId: draft.topicId,
              title: draft.title,
              keywords: activeTopic,
              results: publishResults,
            });
          } else {
            logger.warn("일부 플랫폼 발행 URL 없음 — 상태는 drafted 유지");
          }
        }

        await notifySuccess(draft.title, publishResults);
        await jobStore.markSuccess(draft.title, thumbnailPath);
        return {
          step: "publish",
          title: draft.title,
          thumbnailPath,
        };
      }

      default:
        throw new Error(`알 수 없는 단계: ${options.step}`);
    }
  } catch (error) {
    return handleStepError(error, options.step);
  } finally {
    contentPipeline.close();
    repo.close();
    releasePipelineLock();
  }
}
