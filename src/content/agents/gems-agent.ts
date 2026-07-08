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
import { sanitizeClientReferences } from "../sanitize-client.js";
import type { PublishedPostRecord } from "../seo/published-post-repository.js";
import { brand } from "../../../config/brand.js";
import { parseJsonResponse } from "../llm/json-response-parser.js";

export interface GemsArticleOutput {
  title: string;
  htmlBody: string;
  thumbnailTopLabel: string;
  thumbnailText: string;
}

const MIN_CHARS = loadBlogStyle().structure.minPlainTextChars ?? 3500;
const BANNED_EXPRESSIONS = ["꿀팁", "상담", "총정리", "대박"] as const;

interface LlmReviewResult {
  aliasViolation: boolean;
  bannedExpressionViolation: boolean;
  fabricatedLegalReferenceSuspicion: boolean;
  reason: string;
}

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
  return `\n${knowledgeContext}`;
}

function buildTopicPlanningInstruction(topic: string): string {
  return `
[주제 기획 — JSON 출력 전 내부적으로 수행, 결과만 JSON에 반영]

입력: ${topic}

1) 위 키워드만 보고 독자의 검색 의도·막힌 지점을 추론하십시오.
2) 키워드를 나열하지 말고, **하나의 수임 사례 주제**로 좁혀 어떤 글을 쓸지 결정하십시오.
3) 문장형 제목 후보를 머릿속으로 3개 구상한 뒤, 검색 의도·클릭률 기준으로 **최적 1개**만 title에 사용하십시오.
4) 본문·h2·썸네일 문구도 그 주제에 맞춰 작성하십시오. 키워드 줄줄이 나열 금지.

금지: "${topic}"를 제목·도입부에 쉼표로 그대로 나열하는 것`;
}

function buildUserPrompt(
  topic: string,
  region?: RegionPickResult,
  relatedPosts?: PublishedPostRecord[],
  knowledgeContext?: string,
): string {
  const regionLine = region
    ? `\n타겟 지역: ${region.parentName} / 시·군·구: ${region.pickedShort.join(", ")}`
    : "";

  const keywordMode = looksLikeKeywords(topic);

  if (keywordMode) {
    return `타겟 키워드: ${topic}${regionLine}
${buildTopicPlanningInstruction(topic)}

위 키워드를 **재료**로 삼아, 먼저 글 주제와 최적 제목을 유추·선정한 뒤 '어제 막 해결한 실제 수임 사건' 르포를 작성하세요.

필수:
- 키워드 나열형 제목·도입부·h2 금지 — 하나의 사건 스토리로 통합
- 가상의 구체적 의뢰인(연령·직업·국적·상황) — '의뢰인' 호칭만 사용
- 키워드 표기는 원문 그대로, 본문 문장 속에 3~5회 자연 삽입
- 최소 ${MIN_CHARS}자, 6개 h2 섹션 구조
- JSON 1건만 출력 (title, htmlBody, thumbnailTopLabel, thumbnailText)
- thumbnailTopLabel: 핵심 키워드 1개 압축 5~10자 (나열 금지)
- thumbnailText: 선정한 제목을 2~3줄 문장으로 압축 (\\n 줄바꿈)${buildInternalLinkInstruction(relatedPosts ?? [])}`;
  }

  return `블로그 주제: ${topic}${regionLine}

위 주제로 ${brand.brandName} 1인칭 르포 형식 A형 글을 JSON 1건으로 작성하세요.
최소 ${MIN_CHARS}자(목표 ${MIN_CHARS + 400}자), 반드시 충족. 짧은 요약문·개요만 작성 금지.

필수 구성:
- 수임 사례 스토리텔링(의뢰인 상황·준비과정·반려/보완·해결)을 전편에 걸쳐 전개
- 6개 h2 섹션 + 각 섹션 본문 충분히 작성
- 법령·심사 포인트·서류 체크리스트(8항목+)·Q&A(5문항+, 답변 상세)
- 면책·해시태그·사무소 정보 포함
사례 인물은 '의뢰인'으로만 지칭 (실명·가명 금지).
JSON 1건만 출력 (title, htmlBody, thumbnailTopLabel, thumbnailText).
thumbnailTopLabel: 핵심 키워드 1개 5~10자
thumbnailText: 선정한 제목을 2~3줄로 압축 (\\n 줄바꿈)${buildInternalLinkInstruction(relatedPosts ?? [])}`;
}

/** LLM 응답에서 JSON 추출 */
function parseGemsResponse(raw: string): GemsArticleOutput {
  const { parsed } = parseJsonResponse<GemsArticleOutput>({
    source: raw,
    context: "Gems",
    requiredKeys: ["title", "htmlBody", "thumbnailText"],
  });

  return {
    title: sanitizeBlogTitle(parsed.title as string),
    htmlBody: (parsed.htmlBody as string).trim(),
    thumbnailTopLabel: (parsed.thumbnailTopLabel ?? "").trim(),
    thumbnailText: normalizeThumbnailLineBreaks((parsed.thumbnailText as string).trim()),
  };
}

function extractPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBrandForAliasProbe(text: string): string {
  return text
    .replaceAll(brand.brandName, " ")
    .replaceAll(brand.officeName, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAliasViolation(text: string): boolean {
  const probe = stripBrandForAliasProbe(text);
  const patterns = [
    /\b[A-Z](?:씨|님)\b/,
    /[김이박최정강조윤장임한오서신권황안송류전홍고문양손배조백허유남심노정하곽성차주우구신임나전민][○〇O]{1,2}(?:씨|님)/,
    /[김이박최정강조윤장임한오서신권황안송류전홍고문양손배조백허유남심노정하곽성차주우구신임나전민][가-힣]{1,2}(?:씨|님)/,
    /대표님|사장님|고객님/,
  ];
  return patterns.some((pattern) => {
    const match = probe.match(pattern);
    if (!match) return false;
    // 브랜드명 일부(강운준)는 sanitize 단계에서 이미 보존 — 잔여 오탐 방지
    if (match[0].startsWith("강운")) return false;
    return true;
  });
}

function sanitizeDraftForReview(draft: GemsArticleOutput): GemsArticleOutput {
  return {
    ...draft,
    title: sanitizeBlogTitle(sanitizeClientReferences(draft.title)),
    htmlBody: sanitizeClientReferences(draft.htmlBody),
  };
}

function detectBannedExpression(text: string): string[] {
  return BANNED_EXPRESSIONS.filter((word) => text.includes(word));
}

function detectSuspiciousLegalReference(text: string): boolean {
  const explicitSuspicious =
    /(가상의?\s*법|임의의?\s*법|예시\s*법령|허구의?\s*법령|없는\s*법령)/.test(text);
  if (explicitSuspicious) return true;

  const references = Array.from(
    text.matchAll(/([가-힣A-Za-z0-9·\s]{2,30}?)\s*제\s*(\d{1,4})\s*조/g),
  );
  for (const [, rawLawName, rawArticle] of references) {
    const lawName = rawLawName.trim();
    const article = Number(rawArticle);
    const looksLikeLawName =
      /(법|령|규칙|규정|조례|고시|훈령)$/.test(lawName) ||
      /(시행령|시행규칙)/.test(lawName);
    if (!looksLikeLawName || article >= 500) {
      return true;
    }
  }
  return false;
}

function parseGemsReviewResponse(raw: string): LlmReviewResult {
  const { parsed } = parseJsonResponse<LlmReviewResult>({
    source: raw,
    context: "Gems SelfReview",
    requiredKeys: ["reason"],
  });

  return {
    aliasViolation: Boolean(parsed.aliasViolation),
    bannedExpressionViolation: Boolean(parsed.bannedExpressionViolation),
    fabricatedLegalReferenceSuspicion: Boolean(
      parsed.fabricatedLegalReferenceSuspicion,
    ),
    reason: (parsed.reason ?? "").trim(),
  };
}

async function runLlmSelfReview(
  draft: GemsArticleOutput,
  plainText: string,
): Promise<LlmReviewResult> {
  const system = `당신은 블로그 원고 품질 검수자입니다.
아래 3가지만 엄격하게 판정해 JSON만 출력하세요.

1) aliasViolation: **실제 금지 호칭이 본문에 있을 때만** true
   - true: 대표님, 사장님, 고객님, A씨, 김○○, 김모씨 등 실명·가명·개인호칭
   - false: '의뢰인', '50대 의뢰인', '베트남 국적 의뢰인' 등 규정 호칭
   - false: ${brand.brandName}, ${brand.officeName} 등 사무소·행정사 명칭
2) bannedExpressionViolation: 금지어(꿀팁, 상담, 총정리, 대박)가 **본문 서술**에 있을 때만 true
   (행정사·비자 업무명에 포함된 일반 단어는 맥락상 허용)
3) fabricatedLegalReferenceSuspicion: 법령명이 부자연스럽거나 허구로 보이는 인용 의심 여부

반드시 JSON:
{
  "aliasViolation": boolean,
  "bannedExpressionViolation": boolean,
  "fabricatedLegalReferenceSuspicion": boolean,
  "reason": "핵심 근거 한 줄"
}`;

  const reviewTarget = plainText.slice(0, 6000);
  const user = `제목: ${draft.title}
썸네일 상단: ${draft.thumbnailTopLabel}
썸네일 문구: ${draft.thumbnailText}
본문(일부): ${reviewTarget}`;

  const raw = await chat({
    system,
    user,
    temperature: 0.1,
  });
  return parseGemsReviewResponse(raw);
}

interface ExpandChunkOutput {
  htmlAppend: string;
}

function parseExpandChunkResponse(raw: string): string {
  const { parsed } = parseJsonResponse<ExpandChunkOutput>({
    source: raw,
    context: "Gems Expand",
    requiredKeys: ["htmlAppend"],
  });
  return (parsed.htmlAppend as string).trim();
}

function buildExpandChunkPrompt(
  topic: string,
  title: string,
  plainLen: number,
  shortage: number,
  outline: string,
): string {
  const targetGain = Math.max(shortage + 200, 1200);
  return `주제: ${topic}
제목: ${title}

[이어쓰기 보강 — 필수]
현재 본문 순수 텍스트는 ${plainLen}자입니다. 최소 ${MIN_CHARS}자에 ${shortage}자 부족합니다.
기존 원고 전체를 다시 쓰지 말고, **추가 HTML 조각만** 작성하세요.

요구:
- 순수 텍스트 기준 약 ${targetGain}자 분량의 신규 내용
- h2 1~2개 + 문단/체크리스트/Q&A 보강
- 사례는 '의뢰인' 호칭만, 금지어(꿀팁·상담·총정리·대박) 금지
- 기존 내용을 반복하지 말 것

참고용 기존 본문 일부:
${outline}

JSON만 출력:
{"htmlAppend":"<h2>...</h2><p>...</p>..."}`;
}

/**
 * Gems 에이전트: 사용자 지정 주제 + Gems 프롬프트(작성 규칙)로
 * 제목·HTML 본문·썸네일 문구를 한 번에 생성합니다.
 */
export class GemsAgent {
  private async generateDraft(
    system: string,
    userPrompt: string,
    temperature: number,
  ): Promise<GemsArticleOutput> {
    const raw = await chat({
      system,
      user: userPrompt,
      temperature,
      maxTokens: config.llmMaxTokens,
    });
    return parseGemsResponse(raw);
  }

  private async generateExpandChunk(
    topic: string,
    draft: GemsArticleOutput,
    plainLen: number,
  ): Promise<string> {
    const shortage = MIN_CHARS - plainLen;
    const outline = extractPlainText(draft.htmlBody).slice(0, 1800);
    const system =
      "당신은 한국어 블로그 본문 이어쓰기 전문가입니다. JSON만 출력하세요.";
    const user = buildExpandChunkPrompt(
      topic,
      draft.title,
      plainLen,
      shortage,
      outline,
    );
    const raw = await chat({
      system,
      user,
      temperature: 0.55,
      maxTokens: Math.min(config.llmMaxTokens, 8192),
    });
    return parseExpandChunkResponse(raw);
  }

  async run(
    topic: string,
    region?: RegionPickResult,
    relatedPosts?: PublishedPostRecord[],
    knowledgeContext?: string,
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

    const gemsPrompt = loadGemsSystemPrompt(region);
    const system =
      gemsPrompt +
      buildKnowledgeInstruction(knowledgeContext) +
      buildTechnicalInstruction(region);

    const modelName =
      config.llmProvider === "gemini"
        ? config.geminiModel
        : config.openaiModel;
    console.log(`[Gems] LLM: ${config.llmProvider} / ${modelName}`);
    console.log(`[Gems] 프롬프트: ${config.gemsPromptPath}`);

    const baseUserPrompt = buildUserPrompt(
      topic,
      region,
      relatedPosts,
      knowledgeContext,
    );
    const temperature = config.llmProvider === "gemini" ? 0.7 : 0.65;

    let result = await this.generateDraft(system, baseUserPrompt, temperature);
    let plainText = extractPlainText(result.htmlBody);
    let plainLen = plainText.length;

    // 전체 재작성 대신 추가 HTML을 이어붙여 토큰 한도 잘림을 피함
    const maxLengthRetries = 3;
    for (let attempt = 1; attempt <= maxLengthRetries && plainLen < MIN_CHARS; attempt++) {
      const shortage = MIN_CHARS - plainLen;
      console.warn(
        `[Gems] 본문 길이 미달(${plainLen}/${MIN_CHARS}) — 이어쓰기 보강 ${attempt}/${maxLengthRetries} (부족 ${shortage}자)`,
      );
      const htmlAppend = await this.generateExpandChunk(topic, result, plainLen);
      if (!htmlAppend) {
        console.warn("[Gems] 이어쓰기 조각이 비어 있음 — 다음 시도로 진행");
        continue;
      }
      result = {
        ...result,
        htmlBody: `${result.htmlBody.trim()}\n${htmlAppend}`,
      };
      plainText = extractPlainText(result.htmlBody);
      plainLen = plainText.length;
      console.log(`[Gems] 이어쓰기 후 길이: ${plainLen}/${MIN_CHARS}`);
    }

    if (plainLen < MIN_CHARS) {
      throw new Error(
        `[Gems] 본문 최소 길이 실패: 이어쓰기 보강 ${maxLengthRetries}회 후에도 ${plainLen}/${MIN_CHARS}자입니다.`,
      );
    }

    result = sanitizeDraftForReview(result);
    plainText = extractPlainText(result.htmlBody);
    plainLen = plainText.length;

    const aliasViolation = detectAliasViolation(plainText);
    const bannedDetected = detectBannedExpression(plainText);
    const legalSuspicious = detectSuspiciousLegalReference(plainText);
    const llmReview = await runLlmSelfReview(result, plainText);

    const mergedAliasViolation = aliasViolation;
    if (llmReview.aliasViolation && !aliasViolation) {
      console.warn(
        `[Gems] LLM 호칭 검수 의심(정규식 미검출) — 통과 처리: ${llmReview.reason || "사유 없음"}`,
      );
    }
    const mergedBannedViolation =
      bannedDetected.length > 0 || llmReview.bannedExpressionViolation;
    const mergedLegalSuspicion =
      legalSuspicious || llmReview.fabricatedLegalReferenceSuspicion;

    const violations: string[] = [];
    if (mergedAliasViolation) {
      violations.push("의뢰인 호칭 규칙 위반(실명/가명/개인호칭)");
    }
    if (mergedBannedViolation) {
      const suffix =
        bannedDetected.length > 0
          ? `: ${bannedDetected.join(", ")}`
          : " (LLM 검수 플래그)";
      violations.push(`금지 표현 감지${suffix}`);
    }
    if (mergedLegalSuspicion) {
      violations.push(
        `허위/의심 법령 인용 가능성 (${llmReview.reason || "검수 플래그"})`,
      );
    }
    if (violations.length > 0) {
      throw new Error(`[Gems] 자체 검수 실패: ${violations.join(" | ")}`);
    }

    console.log(`[Gems] 제목: ${result.title}`);
    console.log(`[Gems] 본문: HTML ${result.htmlBody.length}자 / 순수텍스트 ${plainLen}자`);
    console.log(`[Gems] 자체 검수 통과`);
    console.log(`[Gems] 상단 라벨: ${result.thumbnailTopLabel}`);
    console.log(`[Gems] 썸네일 제목: ${result.thumbnailText}`);

    return result;
  }
}
