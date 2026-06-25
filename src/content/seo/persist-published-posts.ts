import type { PublishResult } from "../../publishing/types.js";
import {
  PublishedPostRepository,
  type SavePublishedPostInput,
} from "./published-post-repository.js";
import { logger } from "../../monitoring/logger.js";

/**
 * 발행 성공 결과를 published_posts 테이블에 저장 (SEO 내부 링크용)
 */
export async function persistPublishedPosts(
  options: {
    topicId?: number;
    title: string;
    keywords: string;
    results: PublishResult[];
  },
  repo?: PublishedPostRepository,
): Promise<void> {
  const repository = repo ?? new PublishedPostRepository();
  const ownRepo = !repo;

  try {
    for (const result of options.results) {
      if (!result.success || !result.postUrl) continue;

      const input: SavePublishedPostInput = {
        topicId: options.topicId,
        platform: result.platform,
        title: options.title,
        keywords: options.keywords,
        postUrl: result.postUrl,
      };

      await repository.save(input);
      logger.info(
        `[SEO] 발행 URL 저장: [${result.platform}] ${result.postUrl}`,
      );
    }
  } finally {
    if (ownRepo) repository.close();
  }
}
