import { ThumbnailTextAgent } from "../content/agents/thumbnail-text-agent.js";
import {
  buildTopLabelFromKeywords,
  extractInputKeywordPhrases,
  extractMainKeywords,
} from "../publishing/images/keyword-slug.js";
import { normalizeTopicInput } from "../cli/resolve-blog-topic.js";
import { normalizeThumbnailLineBreaks } from "./normalize-thumbnail-line-breaks.js";

/** Gems 예시 JSON에 박혀 있어 그대로 복사되기 쉬운 문구 */
const STALE_THUMBNAIL_PHRASES = [
  "비자 전쟁에서",
  "살아남는 법",
];

/** 키워드 일치만으로 통과시키면 안 되는 일반 단어 */
const THUMBNAIL_GENERIC_WORDS = new Set([
  "비자",
  "신청",
  "가이드",
  "완벽",
  "방법",
  "절차",
  "총정리",
  "블로그",
  "정리",
  "혜택",
  "요건",
  "발급",
  "준비",
  "해결",
  "확인",
  "지금",
  "모든",
  "관련",
  "대한",
  "위한",
]);

export interface ThumbnailTexts {
  topLabel: string;
  mainText: string;
}

function normalizeKeywords(value: string): string {
  return normalizeTopicInput(value).toLowerCase().replace(/\s+/g, "");
}

function compactText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function extractVisaCode(value: string): string | null {
  const match = value.match(/\b[A-Z]{1,3}-?\d+(?:[A-Z]|-\d+)*\b/i);
  return match?.[0] ?? null;
}

function phraseMatchesHaystack(haystack: string, phrase: string): boolean {
  const compactHaystack = compactText(haystack);
  const trimmed = phrase.trim();
  if (!trimmed) return false;

  if (compactText(trimmed).length >= 2 && compactHaystack.includes(compactText(trimmed))) {
    return true;
  }

  const code = extractVisaCode(trimmed);
  let remainder = trimmed;
  if (code) {
    if (!compactHaystack.includes(compactText(code))) return false;
    remainder = trimmed.replace(code, "").trim();
    if (!remainder) return true;
  }

  const words = remainder
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !THUMBNAIL_GENERIC_WORDS.has(w));

  if (words.length === 0) {
    return compactHaystack.includes(compactText(remainder));
  }

  return words.every((word) => compactHaystack.includes(compactText(word)));
}

function buildFallbackThumbnailMainText(keywords: string, title: string): string {
  const phrases = extractInputKeywordPhrases(keywords);
  const list =
    phrases.length > 0 ? phrases : extractMainKeywords(keywords, title);

  if (list.length >= 2) {
    return `${list[0]}\n${list[1]}`;
  }

  if (list.length === 1) {
    const words = list[0].split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      return `${words.slice(0, 2).join(" ")}\n${words.slice(2).join(" ")}`;
    }
    if (words.length === 2) {
      return `${words[0]}\n${words[1]}`;
    }
    return list[0];
  }

  const titleWords = title
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  if (titleWords.length >= 2) {
    return `${titleWords[0]}\n${titleWords[1]}`;
  }

  return title.trim().slice(0, 24) || "블로그 가이드";
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

  const haystack = `${top}\n${main}`;
  const inputPhrases = extractInputKeywordPhrases(keywords);

  if (inputPhrases.length > 0) {
    return inputPhrases.every((phrase) => phraseMatchesHaystack(haystack, phrase));
  }

  const keywordList = extractMainKeywords(keywords, title).filter(
    (kw) => kw.length >= 2 && !THUMBNAIL_GENERIC_WORDS.has(kw),
  );

  if (keywordList.length === 0) return true;
  return keywordList.every((kw) => phraseMatchesHaystack(haystack, kw));
}

/** 키워드·제목 기준으로 썸네일 상·하단 문구 생성 */
export async function refreshThumbnailTexts(
  keywords: string,
  title: string,
): Promise<ThumbnailTexts> {
  const inputPhrases = extractInputKeywordPhrases(keywords);
  const keywordList = extractMainKeywords(keywords, title);
  const topLabel = buildTopLabelFromKeywords(
    inputPhrases.length > 0 ? inputPhrases : keywordList,
  );

  const agent = new ThumbnailTextAgent();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const mainText = normalizeThumbnailLineBreaks(
      await agent.run(title, keywords),
    );

    if (thumbnailMatchesTopic(keywords, title, topLabel, mainText)) {
      return { topLabel, mainText };
    }

    console.warn(
      `[Thumbnail] 생성 문구가 키워드와 불일치 (시도 ${attempt}/${maxAttempts})`,
    );
  }

  const fallback = buildFallbackThumbnailMainText(keywords, title);
  console.warn("[Thumbnail] 키워드 기반 기본 문구를 사용합니다.");
  return { topLabel, mainText: fallback };
}

export function shouldRefreshThumbnailTexts(
  savedKeywords: string | undefined,
  currentKeywords: string,
  title: string,
  topLabel: string,
  mainText: string,
): boolean {
  if (
    savedKeywords &&
    normalizeKeywords(savedKeywords) !== normalizeKeywords(currentKeywords)
  ) {
    return true;
  }
  return !thumbnailMatchesTopic(currentKeywords, title, topLabel, mainText);
}
