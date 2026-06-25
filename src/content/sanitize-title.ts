/**
 * 블로그 제목 정리 — LLM이 스키마의 '+' 를 그대로 출력하는 경우 제거
 */
export function sanitizeBlogTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, "")
    .replace(/\s*\+\s*/g, " ")
    .replace(/\++/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
