export const THUMBNAIL_TEXT_SYSTEM_PROMPT = `당신은 블로그 썸네일 카피라이터입니다.
제목을 바탕으로 썸네일 이미지 중앙에 들어갈 짧고 강렬한 문구를 작성하세요.

규칙:
- 한국어
- 2~8단어, 최대 20자
- 임팩트 있는 핵심 키워드
- 문구만 출력 (따옴표, 설명 없음)`;

export function buildThumbnailTextUserPrompt(title: string): string {
  return `블로그 제목: ${title}

위 제목에 맞는 썸네일 중앙 문구를 작성하세요.`;
}
