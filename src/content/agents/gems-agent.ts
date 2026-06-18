import { chat } from "../llm/llm-router.js";
import { loadGemsSystemPrompt } from "../llm/gems-prompt-loader.js";
import { buildSampleStructureInstruction } from "../blog-style/load-style.js";

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
  "htmlBody": "<p>도입...</p><h2>소제목</h2><p>본문...</p>",
  "thumbnailTopLabel": "D-8-4 외국인 창업",
  "thumbnailText": "비자 전쟁에서\\n살아남는 법"
}

` +
  buildSampleStructureInstruction() +
  `
htmlBody 규칙:
- 시맨틱 HTML만: <h2>, <p>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>
- h1 금지, <strong>/<b> 금지, 마크다운 금지, 인라인 style 금지
- thumbnailTopLabel: 상단 알약 라벨, 8~18자, 비자코드·핵심 키워드 (예: D-8-4 외국인 창업)
- thumbnailText: 가운데 메인 제목, 2줄(\\n), 줄당 4~10자, 굵은 대제목 스타일. 검은 외곽선 느낌의 짧고 강렬한 문구
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
- 제목은 클릭을 유도하되 낚시성 표현 금지`;
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
    thumbnailText: parsed.thumbnailText.trim(),
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
      temperature: 0.7,
    });

    const result = parseGemsResponse(raw);

    console.log(`[Gems] 제목: ${result.title}`);
    console.log(`[Gems] 본문: ${result.htmlBody.length}자`);
    console.log(`[Gems] 상단 라벨: ${result.thumbnailTopLabel}`);
    console.log(`[Gems] 썸네일 제목: ${result.thumbnailText}`);

    return result;
  }
}
