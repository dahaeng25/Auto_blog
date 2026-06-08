/** RSS에서 수집된 원시 주제 */
export interface RawTopic {
  sourceUrl: string;
  title: string;
  summary: string;
  sourceFeed: string;
  publishedAt?: string;
}

/** DB에 저장된 주제 레코드 */
export interface TopicRecord {
  id: number;
  sourceUrl: string;
  title: string;
  summary: string;
  fetchedAt: string;
  status: TopicStatus;
}

export type TopicStatus = "farmed" | "drafted" | "published";

/** 에이전트 파이프라인 최종 산출물 */
export interface ArticleDraft {
  topicId: number;
  sourceTopic: RawTopic;
  title: string;
  htmlBody: string;
  thumbnailText: string;
  createdAt: string;
}
