/** 블로그 주제·제목에서 메인 키워드 추출 */
const KEYWORD_STOP_WORDS = new Set([
  "현직",
  "행정사가",
  "행정사",
  "알려주는",
  "알려드리는",
  "총정리",
  "완벽",
  "가이드",
  "블로그",
  "정리",
  "방법",
  "절차",
  "신청",
  "하는",
  "있는",
  "위한",
  "대한",
  "관련",
  "모든",
  "오늘",
  "이번",
]);

/** 사용자가 입력한 쉼표·구분자 기준 키워드 구문 (썸네일 검증용) */
export function extractInputKeywordPhrases(keywords: string): string[] {
  const trimmed = keywords.trim();
  if (!trimmed) return [];

  const byDelimiter = trimmed
    .split(/[,，/|·]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (byDelimiter.length > 0) return byDelimiter.slice(0, 4);
  return [trimmed];
}

export function extractMainKeywords(blogTopic: string, title: string): string[] {
  const source = (blogTopic.trim() || title.trim()).replace(/\s+/g, " ");
  if (!source) return ["blog"];

  const byDelimiter = source
    .split(/[,，/|·]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (byDelimiter.length > 1) {
    return byDelimiter.slice(0, 4);
  }

  const codes =
    source.match(/\b[A-Z]{1,3}-?\d+(?:[A-Z]|\-\d+)*\b/gi) ?? [];

  const words = source
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(
      (w) =>
        w.length >= 2 &&
        !KEYWORD_STOP_WORDS.has(w) &&
        !/^(이|가|을|를|의|에|에서|으로|와|과|도)$/.test(w),
    );

  const merged = [...new Set([...codes, ...words])].slice(0, 4);
  if (merged.length > 0) return merged;

  return [source.slice(0, 24)];
}

/** 상단 알약 라벨용 짧은 키워드 문구 */
export function buildTopLabelFromKeywords(keywords: string[]): string {
  if (keywords.length === 0) return "블로그";
  return keywords.slice(0, 3).join(" ").slice(0, 28);
}

export function buildKeywordSlug(keywords: string[]): string {
  const joined = keywords
    .map((k) =>
      k
        .replace(/\s+/g, "")
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 24),
    )
    .join("");

  const slug = joined.replace(/[^a-zA-Z0-9\u3131-\uD79D-]/g, "").slice(0, 72);
  return slug || "blog";
}

/** HTML 본문 h2 소제목 추출 (이미지 메타 문맥용) */
export function extractH2Titles(html: string): string[] {
  const titles: string[] = [];
  const pattern = /<h2[^>]*>(.*?)<\/h2>/gis;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text) titles.push(text);
  }

  return titles;
}
