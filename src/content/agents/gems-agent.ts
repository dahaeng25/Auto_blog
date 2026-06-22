import { chat } from "../llm/llm-router.js";
import { config } from "../../../config/index.js";
import { loadGemsSystemPrompt } from "../llm/gems-prompt-loader.js";
import { buildSampleStructureInstruction, loadBlogStyle } from "../blog-style/load-style.js";
import {
  buildRegionInstruction,
  type RegionPickResult,
} from "../regions/pick-regions.js";
import { normalizeThumbnailLineBreaks } from "../../thumbnail/normalize-thumbnail-line-breaks.js";

export interface GemsArticleOutput {
  title: string;
  htmlBody: string;
  thumbnailTopLabel: string;
  thumbnailText: string;
}

const MIN_CHARS = loadBlogStyle().structure.minPlainTextChars ?? 3500;

/** 프롬프트 본문 외 기술적 보조 지시 (네이버 스타일·HTML 제약) */
function buildTechnicalInstruction(region?: RegionPickResult): string {
  const regionBlock = region ? buildRegionInstruction(region) : "";
  return `
---
[기술 보조 지시 — 프롬프트 본문과 함께 준수]
${regionBlock}
${buildSampleStructureInstruction()}
- htmlBody 순수 텍스트 최소 ${MIN_CHARS}자 미만이면 실패로 간주하고 반드시 보강하십시오.
- 르포 형식 수임 사례 1건을 반드시 전편에 걸쳐 전개하십시오 (빈약한 요약 금지).
- JSON만 출력. 마크다운 코드블록 금지.`;
}

function looksLikeKeywords(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length > 80) return false;
  if (/[,，]/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6 && trimmed.length <= 40;
}

function buildUserPrompt(topic: string, region?: RegionPickResult): string {
  const regionLine = region
    ? `\n타겟 지역: ${region.parentName} / 시·군·구: ${region.pickedShort.join(", ")}`
    : "";

  const keywordMode = looksLikeKeywords(topic);

  if (keywordMode) {
    return `타겟 키워드: ${topic}${regionLine}

위 키워드로 '어제 막 해결한 실제 수임 사건' 르포 형식의 A형 블로그 글을 작성하세요.

필수:
- 가상의 구체적 의뢰인(연령·직업·국적·상황)을 설정하고 전편에 걸쳐 스토리로 전개
- 키워드 띄어쓰기 그대로 유지, 메인 키워드 본문 3~5회
- 최소 ${MIN_CHARS}자 이상, 6개 h2 섹션 구조 준수
- JSON 1건만 출력 (title, htmlBody, thumbnailTopLabel, thumbnailText)
- thumbnailTopLabel: 입력 키워드(비자코드·핵심어) 반영 5~10자
- thumbnailText: 제목 핵심 2~3줄 (\\n 줄바꿈)`;
  }

  return `블로그 주제: ${topic}${regionLine}

위 주제로 강운준 행정사 1인칭 르포 형식 A형 글을 JSON 1건으로 작성하세요.
최소 ${MIN_CHARS}자, 수임 사례 스토리텔링·반려 포인트·법령 인용·체크리스트·Q&A·면책·해시태그 포함.`;
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
 */
export class GemsAgent {
  async run(topic: string, region?: RegionPickResult): Promise<GemsArticleOutput> {
    console.log("[Gems] 사용자 지정 주제로 콘텐츠 생성 중...");
    console.log(`[Gems] 주제: ${topic}`);
    if (region) {
      console.log(
        `[Gems] 지역: ${region.parentName} → ${region.pickedShort.join(", ")}`,
      );
    }

    const gemsPrompt = loadGemsSystemPrompt(region);
    const system = gemsPrompt + buildTechnicalInstruction(region);

    const modelName =
      config.llmProvider === "gemini"
        ? config.geminiModel
        : config.openaiModel;
    console.log(`[Gems] LLM: ${config.llmProvider} / ${modelName}`);
    console.log(`[Gems] 프롬프트: ${config.gemsPromptPath}`);

    const raw = await chat({
      system,
      user: buildUserPrompt(topic, region),
      temperature: config.llmProvider === "gemini" ? 0.7 : 0.65,
    });

    const result = parseGemsResponse(raw);

    console.log(`[Gems] 제목: ${result.title}`);
    const plainLen = result.htmlBody.replace(/<[^>]+>/g, "").length;
    console.log(`[Gems] 본문: HTML ${result.htmlBody.length}자 / 순수텍스트 ${plainLen}자`);
    if (plainLen < MIN_CHARS) {
      console.warn(
        `[Gems] ⚠ 순수 텍스트 ${plainLen}자 — 목표 ${MIN_CHARS}자 미달 (재생성 권장)`,
      );
    }
    console.log(`[Gems] 상단 라벨: ${result.thumbnailTopLabel}`);
    console.log(`[Gems] 썸네일 제목: ${result.thumbnailText}`);

    return result;
  }
}
