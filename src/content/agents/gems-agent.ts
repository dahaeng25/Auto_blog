import { chat } from "../llm/llm-router.js";
import { config } from "../../../config/index.js";
import { loadGemsSystemPrompt } from "../llm/gems-prompt-loader.js";
import { buildSampleStructureInstruction, loadBlogStyle } from "../blog-style/load-style.js";
import {
  buildRegionInstruction,
  type RegionPickResult,
} from "../regions/pick-regions.js";
import { normalizeThumbnailLineBreaks } from "../../thumbnail/normalize-thumbnail-line-breaks.js";
import { sanitizeBlogTitle } from "../sanitize-title.js";
import type { PublishedPostRecord } from "../seo/published-post-repository.js";

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
- [참고 유사 글]이 주입된 경우, 그 글들이 다루는 니즈·반려 포인트·서류 요건을 본문에 반영하십시오.
- 1인칭 수임 사례 1건을 전편에 걸쳐 전개하되, 소설·가상 르포 톤 금지 — 실무에서 흔한 상황에 맞추십시오.
- 사례 인물은 실명·가명 없이 '의뢰인'으로만 지칭 (대표님·사장님·김○○·A씨 금지).
- JSON만 출력. 마크다운 코드블록 금지.`;
}

function looksLikeKeywords(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length > 80) return false;
  if (/[,，]/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6 && trimmed.length <= 40;
}

function buildInternalLinkInstruction(
  relatedPosts: PublishedPostRecord[],
): string {
  if (relatedPosts.length === 0) return "";

  const linkLines = relatedPosts
    .map((p) => `- "${p.title}" (${p.platform}): ${p.postUrl}`)
    .join("\n");

  return `
[SEO 내부 링크 — 필수]
아래 기존 발행 글 중 2~3개를 본문 문맥에 맞게 <a href="URL">자연스러운 앵커텍스트</a>로 연결하세요.
강제 나열·목록 나열 금지. 관련 단락 흐름 안에 녹여 삽입하세요.

기존 발행 글:
${linkLines}`;
}

function buildKnowledgeInstruction(knowledgeContext?: string): string {
  if (!knowledgeContext?.trim()) return "";
  return knowledgeContext;
}

function buildTopicPlanningInstruction(topic: string): string {
  return `
[주제 기획 — JSON 출력 전 내부적으로 수행, 결과만 JSON에 반영]

입력: ${topic}

1) [참고 유사 글]이 있다면, 상위 글들이 다루는 **검색 의도·고객 니즈·반려·서류 포인트**를 먼저 정리하십시오.
2) 위 키워드와 참고 글 패턴을 바탕으로 **실무에서 흔한 수임 상황 1건**으로 글 주제를 좁히십시오.
3) 참고 글 제목 패턴을 분석해 문장형 제목 후보 3개를 구상한 뒤, 검색 의도·클릭률 기준으로 **최적 1개**만 title에 사용하십시오.
4) 본문·h2·썸네일 문구도 참고 글이 다루는 구조·니즈에 맞춰 작성하십시오. 키워드 줄줄이 나열 금지.

금지: "${topic}"를 제목·도입부에 쉼표로 그대로 나열하는 것, 참고 글과 무관한 가상 소설형 스토리`;
}

function buildBlogReferenceInstruction(blogReferenceContext?: string): string {
  if (!blogReferenceContext?.trim()) return "";
  return blogReferenceContext;
}

function buildUserPrompt(
  topic: string,
  region?: RegionPickResult,
  relatedPosts?: PublishedPostRecord[],
  _knowledgeContext?: string,
): string {
  const regionLine = region
    ? `\n타겟 지역: ${region.parentName} / 시·군·구: ${region.pickedShort.join(", ")}`
    : "";

  const keywordMode = looksLikeKeywords(topic);

  if (keywordMode) {
    return `타겟 키워드: ${topic}${regionLine}
${buildTopicPlanningInstruction(topic)}

위 키워드와 [참고 유사 글]을 바탕으로, 먼저 글 주제와 최적 제목을 선정한 뒤 실무 기반 1인칭 수임 사례 글을 작성하세요.

필수:
- 참고 유사 글이 다루는 고객 니즈·반려·서류 요건을 본문에 반영 (문장 복사 금지)
- 키워드 나열형 제목·도입부·h2 금지 — 하나의 실무 사례로 통합
- 소설·가상 르포 톤 금지. 연령·직업·국적·상황은 실무에서 흔한 범위로 — '의뢰인' 호칭만 사용
- 키워드 표기는 원문 그대로, 본문 문장 속에 3~5회 자연 삽입
- 최소 ${MIN_CHARS}자, 6개 h2 섹션 구조
- JSON 1건만 출력 (title, htmlBody, thumbnailTopLabel, thumbnailText)
- thumbnailTopLabel: 핵심 키워드 1개 압축 5~10자 (나열 금지)
- thumbnailText: 선정한 제목을 2~3줄 문장으로 압축 (\\n 줄바꿈)${buildInternalLinkInstruction(relatedPosts ?? [])}`;
  }

  return `블로그 주제: ${topic}${regionLine}

위 주제와 [참고 유사 글]을 바탕으로 강운준 행정사 1인칭 실무 수임 사례 A형 글을 JSON 1건으로 작성하세요.
최소 ${MIN_CHARS}자, 반려 포인트·서류 요건·법령 인용·체크리스트·Q&A·면책·해시태그 포함.
소설형 가상 스토리 금지. 사례 인물은 '의뢰인'으로만 지칭 (실명·가명 금지).${buildInternalLinkInstruction(relatedPosts ?? [])}`;
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
    title: sanitizeBlogTitle(parsed.title),
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
  async run(
    topic: string,
    region?: RegionPickResult,
    relatedPosts?: PublishedPostRecord[],
    knowledgeContext?: string,
    blogReferenceContext?: string,
  ): Promise<GemsArticleOutput> {
    console.log("[Gems] 사용자 지정 주제로 콘텐츠 생성 중...");
    console.log(`[Gems] 주제: ${topic}`);
    if (region) {
      console.log(
        `[Gems] 지역: ${region.parentName} → ${region.pickedShort.join(", ")}`,
      );
    }
    if (relatedPosts && relatedPosts.length > 0) {
      console.log(
        `[Gems] SEO 내부 링크 후보 ${relatedPosts.length}건 주입`,
      );
    }
    if (knowledgeContext?.trim()) {
      console.log("[Gems] PDF 참고 자료 주입");
    }
    if (blogReferenceContext?.trim()) {
      console.log("[Gems] 유사 블로그 참고 자료 주입");
    }

    const gemsPrompt = loadGemsSystemPrompt(region);
    const system =
      gemsPrompt +
      buildBlogReferenceInstruction(blogReferenceContext) +
      buildKnowledgeInstruction(knowledgeContext) +
      buildTechnicalInstruction(region);

    const modelName =
      config.llmProvider === "gemini"
        ? config.geminiModel
        : config.openaiModel;
    console.log(`[Gems] LLM: ${config.llmProvider} / ${modelName}`);
    console.log(`[Gems] 프롬프트: ${config.gemsPromptPath}`);

    const raw = await chat({
      system,
      user: buildUserPrompt(topic, region, relatedPosts, knowledgeContext),
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
