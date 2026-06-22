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
  typography: BlogTypography;
  divider: { html: string };
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
  };
}

const DEFAULT_STYLE: BlogStyleConfig = {
  referenceUrls: [],
  typography: {
    fontFamily: "'Nanum Gothic', 'Malgun Gothic', sans-serif",
    bodyFontSize: "16px",
    bodyLineHeight: "1.85",
    bodyColor: "#333333",
    introAlign: "center",
    bodyAlign: "left",
    h2FontSize: "22px",
    h2FontWeight: "700",
    h2Color: "#1a3a5c",
    h2Align: "center",
    h2Margin: "32px 0 14px 0",
    h3FontSize: "18px",
    h3FontWeight: "700",
    h3Color: "#2a4a6c",
    h3Align: "left",
    h3Margin: "20px 0 10px 0",
    tableFontSize: "15px",
    listFontSize: "16px",
  },
  divider: {
    html: '<p style="text-align:center;margin:28px 0;"><span style="display:inline-block;width:72%;border-top:1px solid #c8c8c8;"></span></p>',
  },
  spacing: {
    paragraphMargin: "0 0 14px 0",
    introParagraphMargin: "0 0 12px 0",
  },
  structure: {
    introParagraphCount: 4,
    minH2Sections: 5,
    requireTable: true,
    requireList: true,
    requireDisclaimer: true,
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
    divider: { ...DEFAULT_STYLE.divider, ...raw.divider },
    spacing: { ...DEFAULT_STYLE.spacing, ...raw.spacing },
    structure: { ...DEFAULT_STYLE.structure, ...raw.structure },
  };
}

/** Gems 프롬프트용 샘플 구성 지시문 */
export function buildSampleStructureInstruction(): string {
  const style = loadBlogStyle();
  const refs = style.referenceUrls.join("\n- ");

  return `
[샘플 블로그 레이아웃 — 반드시 준수]
참고 샘플 (청사 디렉터스 / blue_directors):
- ${refs}

htmlBody 구성 순서 (샘플과 동일한 흐름):
1) 도입부: 가운데 정렬 인사·공감 문단 ${style.structure.introParagraphCount}개 내외 (<p>만 사용)
2) 구분선 역할: 주요 섹션 사이 여백 (스타일은 시스템이 자동 적용)
3) 본문: <h2> 소제목 ${style.structure.minH2Sections}개 이상 — 샘플처럼 짧고 명확한 제목
   예) "○○ 인증", "중요한 요건!", "절차가 어떻게 되나요?", "가장 중요한 포인트!"
   각 h2 아래: 리드 문단 1개 → <h3> 소주제 1~2개 → 상세 <p> 2~3개
4) ${style.structure.requireTable ? "핵심 요건·비교는 <table> 1회 이상" : ""}
5) ${style.structure.requireList ? "체크포인트·절차는 <ul><li>" : ""}
6) 마무리 CTA: 가운데 정렬 문의 유도 문단
7) ${style.structure.requireDisclaimer ? "면책 문구 1회" : ""}

폰트·크기 (인라인 style 금지 — 시스템이 샘플과 같이 자동 적용):
- 본문 16px, 줄간격 1.85, 색상 #333
- h2 22px 굵게, 가운데 정렬, 네이비 #1a3a5c
- h3 18px 굵게, 왼쪽 정렬, #2a4a6c
- 도입·마무리 문단 가운데 정렬

금지: <strong>, <b>, h1, 마크다운, 인라인 style 속성 직접 작성
`;
}
