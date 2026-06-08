import type { RawTopic } from "../../types.js";

export const TITLE_SYSTEM_PROMPT = `당신은 한국어 SEO 블로그 제목 전문가입니다.
주어진 뉴스/트렌드 주제를 바탕으로 클릭을 유도하는 매력적인 블로그 제목 1개만 작성하세요.

규칙:
- 한국어로 작성
- 25~45자 내외
- 숫자, 질문형, 핵심 키워드 포함
- 제목만 출력 (따옴표, 설명, 번호 없음)`;

export function buildTitleUserPrompt(topic: RawTopic): string {
  return `원본 제목: ${topic.title}

요약: ${topic.summary || "(요약 없음)"}

위 주제에 맞는 SEO 최적화 블로그 제목을 1개 작성하세요.`;
}
