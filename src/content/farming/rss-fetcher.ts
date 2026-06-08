import Parser from "rss-parser";
import { config } from "../../../config/index.js";
import type { RawTopic } from "../types.js";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "BlogOrchestrator/0.1" },
});

/** HTML 태그 제거 및 공백 정리 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 단일 RSS 피드에서 주제 목록을 수집합니다.
 */
export async function fetchFeed(feedUrl: string): Promise<RawTopic[]> {
  const feed = await parser.parseURL(feedUrl);

  return (feed.items ?? [])
    .filter((item) => item.title && item.link)
    .map((item) => ({
      sourceUrl: item.link!,
      title: stripHtml(item.title!),
      summary: stripHtml(
        item.contentSnippet ?? item.content ?? item.summary ?? "",
      ).slice(0, 500),
      sourceFeed: feedUrl,
      publishedAt: item.isoDate ?? item.pubDate,
    }));
}

/**
 * 설정된 모든 RSS 피드에서 주제를 수집합니다.
 * 피드별 오류는 로그만 남기고 다음 피드로 진행합니다.
 */
export async function fetchAllFeeds(
  feedUrls: string[] = config.rssFeedUrls,
): Promise<RawTopic[]> {
  const results: RawTopic[] = [];

  for (const url of feedUrls) {
    try {
      const topics = await fetchFeed(url);
      results.push(...topics);
      console.log(`[RSS] ${url} → ${topics.length}건 수집`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[RSS] ${url} 수집 실패: ${msg}`);
    }
  }

  return results;
}
