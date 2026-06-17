import { fetchAllFeeds } from "../farming/rss-fetcher.js";
import { TopicRepository } from "../farming/topic-repository.js";
import type { RawTopic } from "../types.js";

export interface FarmedTopic {
  topicId: number;
  topic: RawTopic;
}

/**
 * 파밍 에이전트: RSS에서 주제를 수집하고 DB 중복을 걸러
 * 아직 발행하지 않은 신규 주제 1건을 반환합니다.
 */
export class FarmingAgent {
  constructor(private readonly repo: TopicRepository) {}

  async run(): Promise<FarmedTopic> {
    console.log("[Farming] RSS 피드 수집 시작...");
    const allTopics = await fetchAllFeeds();

    if (allTopics.length === 0) {
      throw new Error("[Farming] 수집된 주제가 없습니다. RSS 피드를 확인하세요.");
    }

    // 최신순 정렬 (publishedAt 기준)
    const sorted = [...allTopics].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

    for (const topic of sorted) {
      if (await this.repo.existsByUrl(topic.sourceUrl)) {
        continue;
      }

      const topicId = await this.repo.insertTopic(topic);
      console.log(`[Farming] 신규 주제 선정: "${topic.title}" (id=${topicId})`);

      return { topicId, topic };
    }

    throw new Error(
      "[Farming] 모든 수집 주제가 이미 DB에 존재합니다. 내일 다시 시도하거나 RSS 피드를 추가하세요.",
    );
  }
}
