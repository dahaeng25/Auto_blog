import type { TextChunk } from "./chunk-text.js";

/**
 * 검색된 청크를 LLM 프롬프트용 [참고 자료] 블록으로 포맷합니다.
 */
export function buildKnowledgeContext(chunks: TextChunk[]): string {
  if (chunks.length === 0) return "";

  const body = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] 출처: ${chunk.sourceFile} (청크 ${chunk.chunkIndex + 1})\n${chunk.text}`,
    )
    .join("\n\n");

  return `
---
[참고 자료 — PDF에서 추출]
아래는 knowledge/ 폴더 PDF에서 추출·검색한 내용입니다.

**필수 준수**
- 법조항 번호, 금액, 기한, 요건, 서류명 등 **구체적 사실은 아래 [참고 자료]에 있는 내용에서만** 인용하세요.
- 참고 자료에 없는 조항·수치·날짜를 추측하거나 만들지 마세요.
- 일반적 설명·수임 사례 스토리텔링은 가능하되, 사실 주장은 반드시 자료 근거가 있어야 합니다.
- 자료에 없는 내용은 "일반적으로" 또는 "사례에 따라 다를 수 있음" 등으로 한정하세요.

${body}`;
}
