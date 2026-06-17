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
