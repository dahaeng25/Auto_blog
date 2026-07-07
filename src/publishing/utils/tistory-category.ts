/** 티스토리 카테고리 — 제목·키워드 기반 최적 매칭 */

export interface TistoryCategoryOption {
  id: string;
  name: string;
}

interface CategoryRule {
  patterns: RegExp[];
  hints: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    patterns: [/f-?4\b/i, /동포/, /재외동포/, /고려인/, /조선족/],
    hints: ["동포", "f-4", "f4", "재외동포"],
  },
  {
    patterns: [/f-?6\b/i, /결혼/, /국제결혼/, /배우자/],
    hints: ["결혼", "f-6", "f6", "국제결혼"],
  },
  {
    patterns: [/f-?2\b/i, /거주/, /영주/],
    hints: ["거주", "f-2", "f2", "영주"],
  },
  {
    patterns: [
      /비자/,
      /출입국/,
      /체류/,
      /사증/,
      /외국인/,
      /e-?\d/i,
      /d-?\d/i,
      /h-?\d/i,
      /공증/,
      /친속/,
      /가족관계/,
    ],
    hints: ["출입국", "비자", "외국인", "이민", "체류", "사증"],
  },
  {
    patterns: [/공장등록/, /제조/, /공장/],
    hints: ["공장", "제조", "공장등록"],
  },
  {
    patterns: [/나라장터/, /조달/, /입찰/, /g2b/i],
    hints: ["나라장터", "조달", "입찰"],
  },
  {
    patterns: [/인허가/, /허가/, /신고/, /영업/],
    hints: ["인허가", "허가", "행정", "신고"],
  },
  {
    patterns: [/건축/, /착공/, /사용승인/],
    hints: ["건축", "착공", "건축인허가"],
  },
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function scoreCategory(name: string, source: string): number {
  const category = normalizeText(name);
  const text = normalizeText(source);

  if (!category || /분류\s*안\s*함|미분류/.test(category)) {
    return -1;
  }

  let score = 0;

  const tokens = text
    .split(/[,，/|·\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  for (const token of tokens) {
    if (category.includes(token)) score += 24;
    if (token.length >= 3 && text.includes(category)) score += 18;
  }

  for (const rule of CATEGORY_RULES) {
    if (!rule.patterns.some((p) => p.test(text))) continue;
    for (const hint of rule.hints) {
      if (category.includes(hint.toLowerCase())) score += 32;
    }
  }

  return score;
}

/** 사용 가능한 카테고리 중 글 주제와 가장 잘 맞는 항목 선택 */
export function pickTistoryCategory(
  categories: TistoryCategoryOption[],
  title: string,
  keywords: string,
): TistoryCategoryOption | null {
  if (categories.length === 0) return null;

  const source = `${title} ${keywords}`;
  const ranked = categories
    .map((cat) => ({ cat, score: scoreCategory(cat.name, source) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked.find((r) => r.score > 0);
  if (best) return best.cat;

  const fallback = ranked.find((r) => r.score >= 0);
  return fallback?.cat ?? categories[0] ?? null;
}
