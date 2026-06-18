/** 블로그 주제·제목에서 메인 키워드 추출 */
export function extractMainKeywords(blogTopic: string, title: string): string[] {
  const source = (blogTopic.trim() || title.trim()).replace(/\s+/g, " ");
  if (!source) return ["blog"];

  const byDelimiter = source
    .split(/[,，/|·]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (byDelimiter.length > 1) {
    return byDelimiter.slice(0, 5);
  }

  const words = source
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  if (words.length > 0) {
    return words.slice(0, 5);
  }

  return [source.slice(0, 20)];
}

/** 파일명용 키워드 조합 (한글·영문·숫자·하이픈) */
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
