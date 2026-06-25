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
  h3FontSize: string;
  h3FontWeight: string;
  h3Color: string;
  h3Align: string;
  h3Margin: string;
  tableFontSize: string;
  listFontSize: string;
}

export interface BlogStyleConfig {
  referenceUrls: string[];
  brandTagline?: string;
  typography: BlogTypography;
  divider: { html: string };
  brandBand?: { html: string };
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
  brandTagline: "강운준 행정사 공장등록 나라장터 인허가 출입국비자",
  typography: {
    fontFamily: "'Nanum Gothic', 'Malgun Gothic', sans-serif",
    bodyFontSize: "16px",
    bodyLineHeight: "1.9",
    bodyColor: "#333333",
    introAlign: "center",
    bodyAlign: "left",
    h2FontSize: "20px",
    h2FontWeight: "700",
    h2Color: "#222222",
    h2Align: "left",
    h2Margin: "36px 0 16px 0",
    h3FontSize: "17px",
    h3FontWeight: "700",
    h3Color: "#2a4a6c",
    h3Align: "left",
    h3Margin: "22px 0 12px 0",
    tableFontSize: "15px",
    listFontSize: "16px",
  },
  divider: {
    html: '<hr style="border:none;border-top:1px solid #bbbbbb;margin:36px 0;width:100%;">',
  },
  brandBand: {
    html: '<p style="text-align:center;font-family:\'Nanum Gothic\',\'Malgun Gothic\',sans-serif;font-size:15px;line-height:1.9;color:#555555;margin:20px 0;">강운준 행정사 공장등록 나라장터 인허가 출입국비자</p>',
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
      html: raw.brandBand?.html ?? DEFAULT_STYLE.brandBand!.html,
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

/** Gems 프롬프트용 kanghaeng1345 샘플 구성 지시문 */
export function buildSampleStructureInstruction(): string {
  const style = loadBlogStyle();
  const refs = style.referenceUrls.join("\n- ");
  const minChars = style.structure.minPlainTextChars ?? 3200;

  return `
[참고 블로그 레이아웃 — kanghaeng1345 / 강운준 행정사]
참고 URL:
- ${refs}

htmlBody 구성 (위 샘플 글과 동일한 흐름·밀도):
1) 도입부: 가운데 정렬 공감·후킹 <p> ${style.structure.introParagraphCount}개 내외 (1인칭, 실무 톤, 3~4문장씩 짧은 단락)
2) 본문 h2 소제목 ${style.structure.minH2Sections}개 이상 — 번호 형식 권장 (예: "1) 첫 단추, ...", "2) ...", 마지막은 "N. 마치며")
   • 각 h2 아래: 리드 <p> 1~2개 → 상세 <p> 3~5개 (단락당 2~4문장, 빈약한 1~2문장 단락 금지)
   • 핵심 문장은 <blockquote><p>...</p></blockquote> 로 인용구 처리 (섹션당 0~1개)
   • 세부 항목은 <ul><li> 또는 <h3> 소주제 + <p> 조합
3) ${style.structure.requireTable ? "<table> 1회 이상 — 요건·비교·절차 정리" : ""}
4) ${style.structure.requireList ? "<ul><li> 체크포인트 리스트 1회 이상" : ""}
5) ${style.structure.requireCaseStudy ? "실제 수임 사례(익명) 1개 — 인물은 '의뢰인'으로만 지칭, 실명·가명 금지" : ""}
6) ${style.structure.requireQna ? "Q&A 3세트 — <h3>질문</h3><p>답변</p> 형식" : ""}
7) 마무리 CTA: 가운데 정렬 문의 유도 + "강운준 행정사였습니다."
8) 사무소 정보 <p> (가운데): 행정사사무소 다행, 주소, 전국대표번호 1844-1346
9) ${style.structure.requireDisclaimer ? "면책: ※ 본 정보는 법령 개정 등에 따라 변경될 수 있으므로..." : ""}
10) 해시태그 <p> (가운데): #키워드 #지역명 #강운준행정사 형식 10~15개

분량: htmlBody 순수 텍스트 최소 ${minChars}자, 권장 3500~5000자 (짧고 빈약한 글 금지)
구분선·브랜드 문구·폰트는 시스템이 자동 적용 — LLM은 인라인 style 금지

금지: <strong>, <b>, h1, 마크다운, 인라인 style, "상담" 단어
`;
}
