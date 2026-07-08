/** 제목·키워드 기반 브랜드 밴드 전문분야 문구 생성 */
import { brand } from "../../../config/brand.js";

interface SpecialtyRule {
  label: string;
  patterns: RegExp[];
  priority: number;
}

const SPECIALTY_RULES: SpecialtyRule[] = [
  {
    label: "동포비자 전문",
    patterns: [/f-?4\b/i, /동포/, /재외동포/, /고려인/, /조선족/],
    priority: 90,
  },
  {
    label: "결혼비자 전문",
    patterns: [/f-?6\b/i, /결혼이민/, /결혼비자/, /국제결혼/, /배우자초청/],
    priority: 90,
  },
  {
    label: "거주비자 전문",
    patterns: [/f-?2\b/i, /거주비자/, /영주/, /귀화/],
    priority: 85,
  },
  {
    label: "유학비자 전문",
    patterns: [/d-?2\b/i, /유학비자/, /유학생/, /어학연수/],
    priority: 85,
  },
  {
    label: "취업비자 전문",
    patterns: [/e-?[79]\b/i, /e-?10\b/i, /취업비자/, /고용허가/, /구직활동/],
    priority: 85,
  },
  {
    label: "투자비자 전문",
    patterns: [/d-?8\b/i, /투자비자/, /기업투자/, /창업비자/],
    priority: 85,
  },
  {
    label: "방문취업 전문",
    patterns: [/h-?2\b/i, /방문취업/, /시간제취업/, /s-?3\b/i],
    priority: 80,
  },
  {
    label: "가족관계증명 전문",
    patterns: [/친속관계/, /가족관계/, /친족관계/, /호적/, /혼인관계/],
    priority: 88,
  },
  {
    label: "출입국 공증 전문",
    patterns: [/공증/, /아포스티유/, /영사확인/, /대사관/],
    priority: 82,
  },
  {
    label: "체류연장 전문",
    patterns: [/체류연장/, /체류기간/, /연장신청/, /불법체류/],
    priority: 78,
  },
  {
    label: "출입국비자 전문",
    patterns: [/출입국/, /비자/, /체류자격/, /외국인등록/, /사증/],
    priority: 70,
  },
  {
    label: "공장등록 전문",
    patterns: [/공장등록/, /제조업등록/, /공장설립/],
    priority: 88,
  },
  {
    label: "나라장터 전문",
    patterns: [/나라장터/, /조달/, /입찰/, /g2b/i],
    priority: 88,
  },
  {
    label: "건축인허가 전문",
    patterns: [/건축허가/, /건축인허가/, /착공신고/, /사용승인/, /건축물/],
    priority: 86,
  },
  {
    label: "인허가 전문",
    patterns: [/인허가/, /허가신청/, /신고수리/, /영업신고/],
    priority: 75,
  },
  {
    label: "식품위생 전문",
    patterns: [/식품위생/, /haccp/i, /위생교육/, /영업등록/],
    priority: 84,
  },
];

const BROAD_FALLBACK = "행정인허가 전문";

function normalizeSource(title: string, keywords: string): string {
  return `${title} ${keywords}`.replace(/\s+/g, " ").trim();
}

function collectSpecialties(source: string): string[] {
  const matched: { label: string; priority: number }[] = [];

  for (const rule of SPECIALTY_RULES) {
    if (rule.patterns.some((p) => p.test(source))) {
      matched.push({ label: rule.label, priority: rule.priority });
    }
  }

  matched.sort((a, b) => b.priority - a.priority);

  const labels: string[] = [];
  for (const item of matched) {
    if (!labels.includes(item.label)) {
      labels.push(item.label);
    }
    if (labels.length >= 3) break;
  }

  if (labels.length === 0) {
    labels.push(BROAD_FALLBACK);
  }

  return labels;
}

/**
 * 예: "강운준 행정사 동포비자 전문 출입국비자 전문 가족관계증명 전문"
 */
export function buildBrandTagline(title = "", keywords = ""): string {
  const source = normalizeSource(title, keywords);

  if (!source) {
    return `${brand.brandName} 행정인허가 전문`;
  }

  const specialties = collectSpecialties(source);
  return `${brand.brandName} ${specialties.join(" ")}`;
}
