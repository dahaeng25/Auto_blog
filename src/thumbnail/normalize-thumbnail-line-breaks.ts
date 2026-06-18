/** LLM·JSON에서 이스케이프된 \\n 문자를 실제 줄바꿈으로 변환 */
export function normalizeThumbnailLineBreaks(text: string): string {
  return text.replace(/\\n/g, "\n");
}
