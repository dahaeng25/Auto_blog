export const THUMBNAIL_TEXT_SYSTEM_PROMPT = `당신은 블로그 썸네일 카피라이터입니다.
블로그 제목·키워드·본문 요약을 바탕으로 썸네일 중앙에 들어갈 짧고 함축적인 문구를 작성하세요.

규칙:
- 한국어
- 2~3줄, 줄마다 실제 줄바꿈으로 구분 (\\n 문자를 텍스트에 넣지 말 것), 줄당 4~14자
- 제목의 핵심 주제·비자코드·함축 키워드를 반드시 반영 (제목을 그대로 복사하지 말고 압축)
- 입력 키워드의 핵심어(비자코드, 주제명)를 문구에 포함
- 키워드·제목·본문과 무관한 일반 홍보 문구 금지 (예: "비자 전쟁에서", "살아남는 법", "성공의 길로 첫걸음")
- "가족친화인증", "요건 및 혜택" 같은 고정 홍보 문구 금지
- 문구만 출력 (따옴표, 설명 없음)`;

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildThumbnailTextUserPrompt(
  title: string,
  keywords: string,
  htmlBody?: string,
): string {
  const requiredKeywords = keywords
    .split(/[,，/|·]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  const bodyPlain = htmlBody ? stripHtml(htmlBody).slice(0, 400) : "";
  const bodyBlock = bodyPlain
    ? `\n본문 앞부분 요약:\n${bodyPlain}...`
    : "";

  return `입력 키워드: ${keywords}
블로그 제목: ${title}${bodyBlock}

위 제목·키워드·본문 맥락에 맞는 함축적 썸네일 중앙 문구를 작성하세요.
제목의 핵심만 2~3줄로 압축하고, 다음 핵심 키워드를 반드시 포함하세요: ${requiredKeywords || keywords}`;
}
