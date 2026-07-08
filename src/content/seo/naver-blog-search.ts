/**
 * 네이버 블로그 검색 상위 노출 제목 수집 (SEO 참고용)
 */
export async function searchNaverBlogTitles(
  query: string,
  limit = 8,
): Promise<string[]> {
  const mainKeyword = query
    .split(/[,，/|·]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];

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
      console.warn(`[SEO] 네이버 블로그 검색 실패: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const titles = extractTitlesFromNaverHtml(html);
    const unique = [...new Set(titles)].slice(0, limit);

    if (unique.length > 0) {
      console.log(`[SEO] 네이버 블로그 참고 제목 ${unique.length}건 수집`);
    }

    return unique;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[SEO] 네이버 블로그 검색 오류 — ${msg}`);
    return [];
  }
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

function cleanTitle(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitlesFromNaverHtml(html: string): string[] {
  const titles: string[] = [];

  const patterns = [
    /class="[^"]*title_link[^"]*"[^>]*>([^<]+)</g,
    /class="[^"]*api_txt_lines[^"]*"[^>]*>([^<]+)</g,
    /<a[^>]*href="[^"]*blog\.naver\.com[^"]*"[^>]*title="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const title = cleanTitle(match[1] ?? "");
      if (title.length >= 10 && title.length <= 90) {
        titles.push(title);
      }
    }
  }

  return titles;
}
