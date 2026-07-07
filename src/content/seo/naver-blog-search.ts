import { extractInputKeywordPhrases } from "../../publishing/images/keyword-slug.js";

export interface NaverBlogPost {
  title: string;
  snippet: string;
  query: string;
}

/**
 * 네이버 블로그 검색 상위 노출 제목 수집 (SEO 참고용)
 */
export async function searchNaverBlogTitles(
  query: string,
  limit = 8,
): Promise<string[]> {
  const posts = await searchNaverBlogPosts(query, limit);
  return [...new Set(posts.map((p) => p.title))].slice(0, limit);
}

/**
 * 단일 키워드로 네이버 블로그 검색 — 제목·요약 스니펫 수집
 */
export async function searchNaverBlogPosts(
  query: string,
  limit = 6,
): Promise<NaverBlogPost[]> {
  const mainKeyword = query.trim();
  if (!mainKeyword) return [];

  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(mainKeyword)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      console.warn(`[SEO] 네이버 블로그 검색 실패 (${mainKeyword}): HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const posts = extractPostsFromNaverHtml(html, mainKeyword).slice(0, limit);

    if (posts.length > 0) {
      console.log(
        `[SEO] 네이버 블로그 참고 ${posts.length}건 수집 (키워드: ${mainKeyword})`,
      );
    }

    return posts;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[SEO] 네이버 블로그 검색 오류 (${mainKeyword}) — ${msg}`);
    return [];
  }
}

export interface NaverBlogSearchOptions {
  /** 키워드당 최대 수집 건수 */
  perQueryLimit?: number;
  /** 전체 최대 수집 건수 */
  totalLimit?: number;
  /** 검색할 키워드 구문 최대 개수 */
  maxQueries?: number;
}

/**
 * 입력 키워드의 각 구문별로 네이버 블로그를 검색해 중복 제거된 참고 글 목록 반환
 */
export async function searchNaverBlogReferences(
  keywords: string,
  options: NaverBlogSearchOptions = {},
): Promise<NaverBlogPost[]> {
  const perQueryLimit = options.perQueryLimit ?? 5;
  const totalLimit = options.totalLimit ?? 12;
  const maxQueries = options.maxQueries ?? 4;

  const phrases = extractInputKeywordPhrases(keywords).slice(0, maxQueries);
  if (phrases.length === 0) return [];

  const seenTitles = new Set<string>();
  const results: NaverBlogPost[] = [];

  for (const phrase of phrases) {
    if (results.length >= totalLimit) break;

    const posts = await searchNaverBlogPosts(phrase, perQueryLimit);
    for (const post of posts) {
      const key = normalizeTitleKey(post.title);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      results.push(post);
      if (results.length >= totalLimit) break;
    }
  }

  if (results.length > 0) {
    console.log(
      `[SEO] 네이버 유사 글 참고 ${results.length}건 (키워드 ${phrases.length}개 검색)`,
    );
  }

  return results;
}

function normalizeTitleKey(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitlesFromNaverHtml(html: string): string[] {
  const titles: string[] = [];
  const patterns = [
    /class="[^"]*title_link[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*api_txt_lines[^"]*total_tit[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*api_txt_lines[^"]*"[^>]*>([^<]+)</g,
    /<a[^>]*href="[^"]*blog\.naver\.com[^"]*"[^>]*title="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const title = cleanText(match[1] ?? "");
      if (title.length >= 8 && title.length <= 90) {
        titles.push(title);
      }
    }
  }

  return titles;
}

function extractSnippetsFromNaverHtml(html: string): string[] {
  const snippets: string[] = [];
  const patterns = [
    /class="[^"]*dsc_txt[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*dsc_link[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*api_txt_lines[^"]*dsc[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*total_dsc[^"]*"[^>]*>([^<]+)</g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const snippet = cleanText(match[1] ?? "");
      if (snippet.length >= 20 && snippet.length <= 300) {
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

function extractPostsFromNaverHtml(html: string, query: string): NaverBlogPost[] {
  const titles = extractTitlesFromNaverHtml(html);
  const snippets = extractSnippetsFromNaverHtml(html);
  const seen = new Set<string>();
  const posts: NaverBlogPost[] = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i]!;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);

    posts.push({
      title,
      snippet: snippets[i] ?? "",
      query,
    });
  }

  return posts;
}
