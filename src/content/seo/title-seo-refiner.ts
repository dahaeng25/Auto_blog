import { chat } from "../llm/llm-router.js";
import { config } from "../../../config/index.js";
import type { RegionPickResult } from "../regions/pick-regions.js";
import { searchNaverBlogTitles } from "./naver-blog-search.js";
import { normalizeThumbnailLineBreaks } from "../../thumbnail/normalize-thumbnail-line-breaks.js";
import { sanitizeBlogTitle } from "../sanitize-title.js";

export interface TitleSeoInput {
  topic: string;
  title: string;
  thumbnailText: string;
  thumbnailTopLabel: string;
  region?: RegionPickResult;
}

export interface TitleSeoOutput {
  title: string;
  thumbnailText: string;
  thumbnailTopLabel: string;
}

function parseRefineResponse(raw: string): TitleSeoOutput | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<TitleSeoOutput>;
    if (!parsed.title || !parsed.thumbnailText) return null;

    return {
      title: sanitizeBlogTitle(parsed.title),
      thumbnailText: normalizeThumbnailLineBreaks(parsed.thumbnailText.trim()),
      thumbnailTopLabel: (parsed.thumbnailTopLabel ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * 네이버 블로그 검색 상위 제목을 참고해 제목·썸네일 문구를 SEO에 맞게 다듬습니다.
 */
export async function refineTitleAndThumbnail(
  input: TitleSeoInput,
): Promise<TitleSeoOutput> {
  const referenceTitles = await searchNaverBlogTitles(input.topic);
  if (referenceTitles.length === 0) {
    return {
      title: input.title,
      thumbnailText: input.thumbnailText,
      thumbnailTopLabel: input.thumbnailTopLabel,
    };
  }

  const regionHint = input.region
    ? `지역명: ${input.region.pickedShort.join("·")}·강운준 행정사`
    : "강운준 행정사";

  const refList = referenceTitles
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");

  const system = `당신은 네이버 블로그 SEO 전문가이자 행정사 블로그 카피라이터입니다.
입력 키워드로 독자 검색 의도를 먼저 추론하고, 그에 맞는 최적의 문장형 제목 1개를 선정합니다.

규칙:
- 키워드를 쉼표·나열식으로 제목에 붙이지 마세요
- 독자가 겪는 구체적 상황·문제·해결 방향이 드러나는 완성된 문장형 제목
- 메인 키워드는 제목 앞부분 문장 안에 1회만 자연스럽게 포함
- 낚시성 단어(꿀팁, 총정리) 금지, '상담' 금지
- 제목 뒤 ${regionHint}를 공백으로 이어 붙이세요 (+ 기호 사용 금지)
- 썸네일 상단 라벨: 핵심 키워드 1개만 5~10자 (나열 금지)
- 썸네일 메인 문구: 선정한 제목을 2~3줄(\\n 줄바꿈) 문장으로 압축
- 참고 제목을 그대로 복사하지 말고 패턴만 학습
- JSON만 출력: { "title", "thumbnailText", "thumbnailTopLabel" }`;

  const user = `타겟 키워드: ${input.topic}

먼저 이 키워드로 어떤 주제의 글이 필요한지, 독자 검색 의도는 무엇인지 생각하십시오.
그다음 최적의 문장형 제목 1개를 선정해 개선하세요. 키워드 나열형 제목은 금지입니다.

[네이버 블로그 상위 노출 제목 참고]
${refList}

[현재 초안]
- title: ${input.title}
- thumbnailText: ${input.thumbnailText}
- thumbnailTopLabel: ${input.thumbnailTopLabel}

위 참고 제목의 SEO 패턴을 반영해 더 정확하고 클릭률 높은 제목·썸네일 문구로 개선하세요.`;

  try {
    const raw = await chat({
      system,
      user,
      temperature: config.llmProvider === "gemini" ? 0.6 : 0.5,
    });

    const refined = parseRefineResponse(raw);
    if (!refined) {
      console.warn("[SEO] 제목 개선 JSON 파싱 실패 — 초안 유지");
      return input;
    }

    console.log(`[SEO] 제목 개선: ${refined.title}`);
    return refined;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[SEO] 제목 개선 실패 — 초안 유지 (${msg})`);
    return input;
  }
}
