import fs from "node:fs";
import path from "node:path";
import { config } from "../../../config/index.js";

export interface BlogTypography {
  fontFamily: string;
  bodyFontSize: string;
  bodyLineHeight: string;
  bodyColor: string;
  introAlign: string;
  bodyAlign: string;
  h2FontSize: string;
  h2FontWeight: string;
  h2Color: string;
  h2Align: string;
  h2Margin: string;
  h2PaddingBottom?: string;
  h2BorderBottom?: string;
  h2LetterSpacing?: string;
  h3FontSize: string;
  h3FontWeight: string;
  h3Color: string;
  h3Align: string;
  h3Margin: string;
  tableFontSize: string;
  listFontSize: string;
  /** 마무리 CTA·사무소 정보·해시태그 정렬 */
  footerAlign?: string;
}

export interface BlogStyleConfig {
  referenceUrls: string[];
  brandTagline?: string;
  typography: BlogTypography;
  divider: { html: string };
  brandBand?: { html?: string; repeatPerSection?: boolean };
  blockquote?: { borderColor: string; background: string };
  spacing: {
    paragraphMargin: string;
    introParagraphMargin: string;
  };
  structure: {
    introParagraphCount: number;
    minH2Sections: number;
    requireTable: boolean;
    requireList: boolean;
    requireDisclaimer: boolean;
    requireQna?: boolean;
    requireCaseStudy?: boolean;
    minPlainTextChars?: number;
  };
}

const DEFAULT_STYLE: BlogStyleConfig = {
  referenceUrls: [],
  brandTagline: "강운준 행정사",
  typography: {
    fontFamily: "'Nanum Gothic', 'Malgun Gothic', sans-serif",
    bodyFontSize: "16px",
    bodyLineHeight: "1.9",
    bodyColor: "#333333",
    introAlign: "left",
    bodyAlign: "left",
    h2FontSize: "21px",
    h2FontWeight: "800",
    h2Color: "#1a3a5c",
    h2Align: "left",
    h2Margin: "36px 0 0 0",
    h2PaddingBottom: "10px",
    h2BorderBottom: "2px solid #1a3a5c",
    h2LetterSpacing: "-0.3px",
    h3FontSize: "17px",
    h3FontWeight: "700",
    h3Color: "#2a4a6c",
    h3Align: "left",
    h3Margin: "22px 0 12px 0",
    tableFontSize: "15px",
    listFontSize: "16px",
    footerAlign: "center",
  },
  divider: {
    html: '<hr style="border:none;border-top:1px solid #bbbbbb;margin:36px 0;width:100%;">',
  },
  brandBand: {
    repeatPerSection: false,
  },
  blockquote: {
    borderColor: "#1a3a5c",
    background: "#f7f9fc",
  },
  spacing: {
    paragraphMargin: "0 0 18px 0",
    introParagraphMargin: "0 0 16px 0",
  },
  structure: {
    introParagraphCount: 4,
    minH2Sections: 4,
    requireTable: true,
    requireList: true,
    requireDisclaimer: true,
    requireQna: true,
    requireCaseStudy: true,
    minPlainTextChars: 3500,
  },
};

export function loadBlogStyle(): BlogStyleConfig {
  const stylePath = path.resolve(config.blogStylePath);
  if (!fs.existsSync(stylePath)) return DEFAULT_STYLE;

  const raw = JSON.parse(fs.readFileSync(stylePath, "utf-8")) as Partial<BlogStyleConfig>;
  return {
    ...DEFAULT_STYLE,
    ...raw,
    typography: { ...DEFAULT_STYLE.typography, ...raw.typography },
    divider: {
      html: raw.divider?.html ?? DEFAULT_STYLE.divider.html,
    },
    brandBand: {
      html: raw.brandBand?.html,
      repeatPerSection: raw.brandBand?.repeatPerSection ?? false,
    },
    blockquote: {
      borderColor:
        raw.blockquote?.borderColor ?? DEFAULT_STYLE.blockquote!.borderColor,
      background:
        raw.blockquote?.background ?? DEFAULT_STYLE.blockquote!.background,
    },
    spacing: { ...DEFAULT_STYLE.spacing, ...raw.spacing },
    structure: { ...DEFAULT_STYLE.structure, ...raw.structure },
  };
}

/** Gems 프롬프트용 dahaeng25 샘플 구성 지시문 */
export function buildSampleStructureInstruction(): string {
  const style = loadBlogStyle();
  const refs = style.referenceUrls.join("\n- ");
  const minChars = style.structure.minPlainTextChars ?? 3200;

  return `
[참고 블로그 레이아웃 — dahaeng25 / 강운준 행정사 실무 톤]
참고 URL (톤·밀도·h2 흐름만 학습, 문장 복사 금지):
- ${refs}

htmlBody 구성 (위 샘플과 동일한 흐름):
1) 도입부: 왼쪽 정렬 <p> ${style.structure.introParagraphCount}개 — 1인칭 실무 르포, 「며칠 전…」「전화를 받고…」 장면으로 시작
2) 본문 h2 ${style.structure.minH2Sections}개 — **번호 형식 필수** ("1) …", "2) …", "6. 마치며")
   • 각 섹션은 <h2>로 시작 → 아래 <p>만 연결 (h2 단위로 한 덩어리, 중간에 h2 끼워넣기 금지)
   • h2 소제목은 키워드 나열 금지 — 사건·문제·해결 포인트가 드러나는 문장형 ("1) 친속관계 공증, 이 항목이 빠지면 반려")
   • 핵심 문장: <blockquote><p>...</p></blockquote> (섹션당 0~1)
3) ${style.structure.requireTable ? "<table> 1회 — 요건·절차 정리" : ""}
4) ${style.structure.requireList ? "<ul><li> 체크리스트 5개+" : ""}
5) ${style.structure.requireCaseStudy ? "수임 사례 — '의뢰인'만, 실명·가명 금지" : ""}
6) ${style.structure.requireQna ? "Q&A 3세트 — <h3>질문</h3><p>답변</p>" : ""}
7) 마무리·사무소·해시태그만 가운데 정렬 <p> 허용 (그 외 본문은 왼쪽 정렬)

분량: 순수 텍스트 최소 ${minChars}자
구분선·폰트는 시스템 자동 적용 — 인라인 style 금지

금지: <strong>, <b>, h1, 마크다운, div, "상담", "알아보겠습니다", "정리해 드릴게요", "결론적으로"
`;
}
