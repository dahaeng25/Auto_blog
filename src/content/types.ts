export type TopicStatus = "farmed" | "drafted" | "published";

export interface RawTopic {
  sourceUrl: string;
  title: string;
  summary: string;
  sourceFeed: string;
  publishedAt?: string;
}

export interface ArticleDraft {
  topicId: number;
  sourceTopic: RawTopic;
  title: string;
  htmlBody: string;
  thumbnailText: string;
  /** 썸네일 상단 알약 라벨 (주제 키워드) */
  thumbnailTopLabel?: string;
  createdAt: string;
}

export interface TopicRecord {
  id: number;
  sourceUrl: string;
  title: string;
  summary: string;
  fetchedAt: string;
  status: TopicStatus;
}

/** 콘텐츠 파이프라인 실행 옵션 */
export interface ContentRunOptions {
  /** 실행 시 지정한 블로그 주제/키워드 (.env보다 우선) */
  blogTopic?: string;
  /** true면 동일 주제 기존 원고를 무시하고 새로 생성 */
  forceRegenerate?: boolean;
}
