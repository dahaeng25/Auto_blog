import { ThumbnailTextAgent } from "../content/agents/thumbnail-text-agent.js";
import {
  buildTopLabelFromKeywords,
  extractMainKeywords,
} from "../publishing/images/keyword-slug.js";
import { normalizeTopicInput } from "../cli/resolve-blog-topic.js";

/** Gems 예시 JSON에 박혀 있어 그대로 복사되기 쉬운 문구 */
const STALE_THUMBNAIL_PHRASES = [
  "비자 전쟁에서",
  "살아남는 법",
];

export interface ThumbnailTexts {
  topLabel: string;
  mainText: string;
}

function normalizeKeywords(value: string): string {
  return normalizeTopicInput(value).toLowerCase().replace(/\s+/g, "");
}

/** 썸네일 문구가 현재 키워드·제목과 맞는지 검사 */
export function thumbnailMatchesTopic(
  keywords: string,
  title: string,
  topLabel: string,
  mainText: string,
): boolean {
  const top = topLabel.trim();
  const main = mainText.trim();
  if (!top || !main) return false;

  for (const phrase of STALE_THUMBNAIL_PHRASES) {
    if (main.includes(phrase) && !keywords.includes(phrase.replace(/\s/g, ""))) {
      return false;
    }
  }

  const keywordList = extractMainKeywords(keywords, title);
  const haystack = `${top}\n${main}`.toLowerCase();

  const hits = keywordList.filter((kw) => {
    const compact = kw.toLowerCase().replace(/\s+/g, "");
    return (
      haystack.includes(kw.toLowerCase()) ||
      (compact.length >= 2 && haystack.replace(/\s+/g, "").includes(compact))
    );
  });

  return hits.length > 0;
}

/** 키워드·제목 기준으로 썸네일 상·하단 문구 생성 */
export async function refreshThumbnailTexts(
  keywords: string,
  title: string,
): Promise<ThumbnailTexts> {
  const keywordList = extractMainKeywords(keywords, title);
  const topLabel = buildTopLabelFromKeywords(keywordList);

  const agent = new ThumbnailTextAgent();
  const mainText = await agent.run(title);

  return { topLabel, mainText };
}

export function shouldRefreshThumbnailTexts(
  savedKeywords: string | undefined,
  currentKeywords: string,
  title: string,
  topLabel: string,
  mainText: string,
): boolean {
  if (!savedKeywords) return true;
  if (normalizeKeywords(savedKeywords) !== normalizeKeywords(currentKeywords)) {
    return true;
  }
  return !thumbnailMatchesTopic(currentKeywords, title, topLabel, mainText);
}
