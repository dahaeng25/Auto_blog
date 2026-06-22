/**
 * HTML 본문을 구간(section) 단위로 분할합니다.
 * h2 소제목 기준 우선, 없으면 문단 그룹으로 분할합니다.
 */
export function splitHtmlIntoSections(html: string, maxSections = 8): string[] {
  const normalized = html.trim();
  if (!normalized) return [];

  const byH2 = normalized
    .split(/(?=<h2[\s>])/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (byH2.length > 1) {
    return byH2.slice(0, maxSections);
  }

  const paragraphs = normalized
    .split(/(?<=<\/p>)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return [normalized];
  }

  const targetSections = Math.min(maxSections, paragraphs.length);
  const groupSize = Math.max(1, Math.ceil(paragraphs.length / targetSections));
  const sections: string[] = [];

  for (let i = 0; i < paragraphs.length; i += groupSize) {
    sections.push(paragraphs.slice(i, i + groupSize).join(""));
    if (sections.length >= maxSections) break;
  }

  return sections.length > 0 ? sections : [normalized];
}

export interface PublishSection {
  html: string;
  h2Title: string | null;
  /** 서브썸네일 배열 인덱스 (0부터) */
  subThumbnailIndex: number | null;
}

/**
 * 퍼블리싱용 분할: 도입부 + h2 단락별 구간.
 * 서브썸네일은 h2 단락 상단에 1:1 매핑.
 */
export function splitHtmlForPublishing(html: string): {
  intro: string | null;
  sections: PublishSection[];
} {
  const normalized = html.trim();
  if (!normalized) {
    return { intro: null, sections: [] };
  }

  const firstH2 = normalized.search(/<h2[\s>]/i);
  if (firstH2 === -1) {
    return { intro: normalized, sections: [] };
  }

  const intro =
    firstH2 > 0 ? normalized.slice(0, firstH2).trim() || null : null;
  const body = normalized.slice(firstH2);

  const sections = body
    .split(/(?=<h2[\s>])/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sectionHtml, index) => {
      const h2Match = sectionHtml.match(/<h2[^>]*>(.*?)<\/h2>/is);
      const h2Title = h2Match
        ? h2Match[1].replace(/<[^>]+>/g, "").trim()
        : null;
      return {
        html: sectionHtml,
        h2Title,
        subThumbnailIndex: h2Title ? index : null,
      };
    });

  return { intro, sections };
}
