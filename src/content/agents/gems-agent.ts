import { chat } from "../llm/llm-router.js";
import { loadGemsSystemPrompt } from "../llm/gems-prompt-loader.js";
import { buildSampleStructureInstruction, loadBlogStyle } from "../blog-style/load-style.js";
import { normalizeThumbnailLineBreaks } from "../../thumbnail/normalize-thumbnail-line-breaks.js";

export interface GemsArticleOutput {
  title: string;
  htmlBody: string;
  thumbnailTopLabel: string;
  thumbnailText: string;
}

const OUTPUT_FORMAT_INSTRUCTION =
  `
---
[출력 형식 — 반드시 준수]
아래 JSON 형식만 출력하세요. 마크다운 코드블록 없이 순수 JSON만 반환합니다.

{
  "title": "SEO 최적화 블로그 제목",
  "htmlBody": "<p>도입...</p><h2>소제목</h2><p>핵심 요약...</p><h3>세부 주제</h3><p>본문...</p>",
  "thumbnailTopLabel": "입력 키워드 기반 상단 라벨 8~18자",
  "thumbnailText": "제목 핵심을 담은\\n2줄 썸네일 문구"
}

주의: thumbnailTopLabel·thumbnailText는 반드시 입력 키워드와 생성한 제목에 맞게 새로 작성하세요. 예시 문구를 그대로 복사하지 마세요.

[글 품질 — 정확도·실무성 우선]
- 10년 차 행정사가 직접 쓴 것처럼 구체적·사실 기반으로 작성 (추상적·엉성한 표현 금지)
- 법령명, 서류명, 관청명, 요건·절차는 실무에서 쓰는 정확한 용어로 기술
- 각 h2 섹션은 반드시 아래 구조를 따르세요:
  1) <h2> 짧고 명확한 소제목 (6~18자, 독자 관심 유도)
  2) <p> 해당 섹션 핵심을 1~2문장으로 요약하는 리드 문단
  3) <h3> 세부 소주제 1~2개 (4~12자, 핵심 키워드 포함)
  4) <p> 세부 설명 2~3문단 (단락당 3~4문장, 모바일 가독성)
  5) 필요 시 <ul><li> 체크리스트 또는 <table> 비교표
- 도입부: 공감 3~4문단 → 독자 상황·검색 의도에 맞는 후킹
- A형/B형 2개 작성 지시는 무시하고, 위 JSON 1건만 출력
- 투트랙·해시태그·제목 후보 5개·이미지 프롬프트는 출력하지 마세요

` +
  buildSampleStructureInstruction() +
  `
htmlBody 규칙:
- 시맨틱 HTML만: <h2>, <h3>, <p>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>
- h1 금지, <strong>/<b> 금지, 마크다운 금지, 인라인 style 금지
- h2 소제목 ${loadBlogStyle().structure.minH2Sections}개 이상 필수
- 각 h2 아래 h3 소주제 1개 이상 권장
- thumbnailTopLabel: 입력 키워드(비자코드·핵심어)를 그대로 반영한 상단 라벨. 다른 주제 문구 금지
- thumbnailText: 입력 키워드와 생성한 제목의 핵심만 담은 2~3줄 메인 제목. 키워드에 없는 주제·비자코드 사용 금지
`;

function looksLikeKeywords(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length > 80) return false;
  if (/[,，]/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6 && trimmed.length <= 40;
}

function buildUserPrompt(topic: string): string {
  const keywordMode = looksLikeKeywords(topic);

  if (keywordMode) {
    return `입력 키워드: ${topic}

위는 블로그 주제 키워드입니다. 키워드만으로 검색 의도·독자 니즈를 분석하고,
Gems 규칙에 맞는 SEO 최적화 **제목**, **htmlBody**, **thumbnailText**를 직접 설계하세요.

요구사항:
- 키워드의 띄어쓰기를 임의로 바꾸지 말고 그대로 본문·제목에 반영
- 키워드가 짧아도 실무형 블로그 글 전체를 완성할 것
- 제목은 클릭을 유도하되 낚시성 표현 금지
- 각 h2 단락마다 리드 문단 + h3 소주제 + 상세 설명으로 짜임새 있게 작성
- 법령·서류·절차는 구체적으로, 확인되지 않은 수치는 단정하지 말 것
- thumbnailTopLabel: 입력 키워드(비자코드·핵심어)를 그대로 반영
- thumbnailText: 입력 키워드와 생성한 제목 핵심을 2~3줄로 요약. 키워드에 없는 주제 사용 금지`;
  }

  return `오늘의 블로그 주제: ${topic}

위 주제로 Gems에 정의된 규칙과 스타일에 맞는 블로그 글을 작성하세요.`;
}

/** LLM 응답에서 JSON 추출 */
function parseGemsResponse(raw: string): GemsArticleOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gems 응답에서 JSON을 찾을 수 없습니다.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GemsArticleOutput>;

  if (!parsed.title || !parsed.htmlBody || !parsed.thumbnailText) {
    throw new Error(
      "Gems 응답 JSON에 title, htmlBody, thumbnailText가 모두 필요합니다.",
    );
  }

  return {
    title: parsed.title.trim(),
    htmlBody: parsed.htmlBody.trim(),
    thumbnailTopLabel: (parsed.thumbnailTopLabel ?? "").trim(),
    thumbnailText: normalizeThumbnailLineBreaks(parsed.thumbnailText.trim()),
  };
}

/**
 * Gems 에이전트: 사용자 지정 주제 + Gems 프롬프트(작성 규칙)로
 * 제목·HTML 본문·썸네일 문구를 한 번에 생성합니다.
 *
 * Gems 프롬프트는 파일에서 로드하며, API는 LLM_PROVIDER 설정을 따릅니다.
 * (OpenAI API + Gems 지시문 조합 지원)
 */
export class GemsAgent {
  async run(topic: string): Promise<GemsArticleOutput> {
    console.log("[Gems] 사용자 지정 주제로 콘텐츠 생성 중...");
    console.log(`[Gems] 주제: ${topic}`);

    const gemsPrompt = loadGemsSystemPrompt();
    const system = gemsPrompt + OUTPUT_FORMAT_INSTRUCTION;

    const raw = await chat({
      system,
      user: buildUserPrompt(topic),
      temperature: 0.5,
    });

    const result = parseGemsResponse(raw);

    console.log(`[Gems] 제목: ${result.title}`);
    console.log(`[Gems] 본문: ${result.htmlBody.length}자`);
    console.log(`[Gems] 상단 라벨: ${result.thumbnailTopLabel}`);
    console.log(`[Gems] 썸네일 제목: ${result.thumbnailText}`);

    return result;
  }
}
