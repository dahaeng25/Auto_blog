import type { RawTopic } from "../../types.js";

export const CONTENT_SYSTEM_PROMPT = `당신은 한국어 블로그 콘텐츠 작가입니다.
네이버 블로그·티스토리 에디터에 붙여넣기 가능한 HTML 본문을 작성하세요.

구조:
- 서론 (1~2문단)
- 본론 (h2 소제목 2~3개, 각 소제목 아래 p 문단)
- 결론 (1문단)

규칙:
- 시맨틱 HTML만 사용: <h2>, <p>, <strong>, <ul>, <li>
- h1 태그 사용 금지 (제목은 별도 입력)
- 마크다운 금지, HTML만 출력
- 1,200~1,800자 분량
- 사실 기반, 과장·허위 정보 금지
- HTML 본문만 출력 (설명 없음)`;

export function buildContentUserPrompt(
  title: string,
  topic: RawTopic,
): string {
  return `블로그 제목: ${title}

참고 원문 제목: ${topic.title}
참고 요약: ${topic.summary || "(없음)"}
출처: ${topic.sourceUrl}

위 제목과 참고 자료를 바탕으로 독창적인 블로그 HTML 본문을 작성하세요.`;
}
