import fs from "node:fs/promises";
import { config, getEnabledPlatforms } from "../../../config/index.js";
import { TopicRepository } from "../../content/farming/topic-repository.js";
import { persistPublishedPosts } from "../../content/seo/persist-published-posts.js";
import { ensureWritableDirs } from "../../fs/ensure-writable-dirs.js";
import { logger } from "../../monitoring/logger.js";
import { notifySuccess } from "../../monitoring/discord-notifier.js";
import { resetBlogSessionFiles } from "../reset-blog-session.js";
import { prepareNaverImageSet } from "../../publishing/images/prepare-naver-images.js";
import {
  buildKeywordSlug,
  buildSubThumbnailFilename,
  extractH2Titles,
  extractMainKeywords,
} from "../../publishing/images/keyword-slug.js";
import { PublishPipeline } from "../../publishing/publish-pipeline.js";
import { loadDraftFromWorkspace } from "../draft-workspace.js";
import {
  ensureStyledBody,
  PLATFORM_NAVER,
  PLATFORM_TISTORY,
  TOPIC_STATUS_PUBLISHED,
} from "./shared.js";

/**
 * Phase 4: 발행 플랫폼 업로드를 수행한다.
 */
export async function runPublishStep(): Promise<void> {
  await ensureWritableDirs();

  await ensureStyledBody();

  const { keywords, draft, thumbnailPath: savedPath, subThumbnailPaths } =
    await loadDraftFromWorkspace();

  if (!savedPath) {
    throw new Error("썸네일이 없습니다. 먼저 [5] 썸네일 생성을 실행하세요.");
  }

  try {
    await fs.access(savedPath);
  } catch {
    throw new Error(`썸네일 파일을 찾을 수 없습니다: ${savedPath}`);
  }

  const keywordList = extractMainKeywords(keywords, draft.title);
  const keywordSlug = buildKeywordSlug(keywordList);
  const enabledPlatforms = getEnabledPlatforms();
  const needsPreparedImages =
    enabledPlatforms.includes(PLATFORM_NAVER) ||
    enabledPlatforms.includes(PLATFORM_TISTORY);

  let naverImages;
  if (needsPreparedImages) {
    const h2Titles = extractH2Titles(draft.htmlBody);
    const subThumbnails = (subThumbnailPaths ?? []).map((p, i) => ({
      path: p,
      sectionTitle: h2Titles[i] ?? `단락 ${i + 1}`,
      sequence: i + 2,
      filename: buildSubThumbnailFilename(draft.title, i + 2),
    }));

    naverImages = await prepareNaverImageSet({
      thumbnailPath: savedPath,
      htmlBody: draft.htmlBody,
      title: draft.title,
      blogTopic: keywords,
      subThumbnails: subThumbnails.length > 0 ? subThumbnails : undefined,
    });
  }

  const publishPipeline = new PublishPipeline();
  const results = await publishPipeline.run({
    title: draft.title,
    htmlBody: draft.htmlBody,
    thumbnailPath: naverImages?.thumbnail.absolutePath ?? savedPath,
    blogTopic: keywords,
    naverImages,
  });

  console.log("\n─── 업로드 결과 ───");
  for (const r of results) {
    console.log(
      `[${r.platform}] ${r.success ? "성공" : "실패"}${r.postUrl ? ` → ${r.postUrl}` : ""}`,
    );
  }

  if (config.publishDryRun) {
    console.log("\nℹ️  PUBLISH_DRY_RUN=true — 실제 발행은 수행되지 않았습니다.");
    console.log("   실제 발행: .env 에서 PUBLISH_DRY_RUN=false 설정");
  } else {
    const repo = new TopicRepository();
    try {
      const allPublished = results.every((r) => r.postUrl);
      if (allPublished && draft.topicId > 0) {
        await repo.updateStatus(draft.topicId, TOPIC_STATUS_PUBLISHED);
        logger.info(`주제 상태 업데이트: ${TOPIC_STATUS_PUBLISHED} (id=${draft.topicId})`);
      }

      if (allPublished) {
        await persistPublishedPosts({
          topicId: draft.topicId > 0 ? draft.topicId : undefined,
          title: draft.title,
          keywords,
          results,
        });

        await notifySuccess(draft.title, results);
      }

      if (results.some((r) => r.success)) {
        await resetBlogSessionFiles();
        console.log(
          "\n[설정] 업로드 완료 — 키워드·지역을 초기화했습니다. 다음 글은 [1] 또는 [9]에서 다시 입력하세요.",
        );
      }
    } finally {
      repo.close();
    }
  }
}
