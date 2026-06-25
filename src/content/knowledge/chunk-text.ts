export interface TextChunk {
  sourceFile: string;
  chunkIndex: number;
  text: string;
}

const TARGET_CHUNK_SIZE = 650;
const OVERLAP_SIZE = 100;

/**
 * 긴 텍스트를 검색·주입에 적합한 크기의 청크로 분할합니다.
 */
export function chunkText(sourceFile: string, text: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    let end = Math.min(start + TARGET_CHUNK_SIZE, normalized.length);

    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("。 "),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(" "),
      );
      if (lastBreak > TARGET_CHUNK_SIZE * 0.4) {
        end = start + lastBreak + 1;
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece.length > 0) {
      chunks.push({ sourceFile, chunkIndex, text: piece });
      chunkIndex += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(end - OVERLAP_SIZE, start + 1);
  }

  return chunks;
}
