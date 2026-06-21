export const THUMBNAIL_TEXT_SYSTEM_PROMPT = `당신은 블로그 썸네일 카피라이터입니다.
입력 키워드와 제목을 바탕으로 썸네일 이미지 중앙에 들어갈 짧고 강렬한 문구를 작성하세요.

규칙:
- 한국어
- 2~3줄, 줄마다 실제 줄바꿈으로 구분 (\\n 문자를 텍스트에 넣지 말 것), 줄당 4~12자
- 입력 키워드의 핵심어(비자코드, 주제명)를 반드시 문구에 포함
- 키워드·제목과 무관한 일반 홍보 문구 금지 (예: "비자 전쟁에서", "살아남는 법")
- "가족친화인증", "요건 및 혜택" 같은 고정 홍보 문구 금지
- 문구만 출력 (따옴표, 설명 없음)`;

export function buildThumbnailTextUserPrompt(
  title: string,
  keywords: string,
): string {
  const requiredKeywords = keywords
    .split(/[,，/|·]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return `입력 키워드: ${keywords}
블로그 제목: ${title}

위 키워드와 제목에 맞는 썸네일 중앙 문구를 작성하세요.
반드시 다음 핵심 키워드를 문구에 포함하세요: ${requiredKeywords || keywords}`;
}
