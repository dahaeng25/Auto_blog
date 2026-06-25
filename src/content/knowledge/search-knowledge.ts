import { config } from "../../../config/index.js";
import { buildKnowledgeContext } from "./build-knowledge-context.js";
import { chunkText, type TextChunk } from "./chunk-text.js";
import { loadPdfs } from "./load-pdfs.js";

const STOP_WORDS = new Set([
  "및",
  "등",
  "의",
  "를",
  "을",
  "이",
  "가",
  "은",
  "는",
  "에",
  "에서",
  "으로",
  "로",
  "와",
  "과",
  "도",
  "한",
  "하는",
  "하기",
  "대한",
  "관련",
  "경우",
  "수",
  "있",
  "없",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "a",
  "an",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function scoreChunk(queryTokens: string[], chunk: TextChunk): number {
  if (queryTokens.length === 0) return 0;

  const chunkTokens = new Set(tokenize(chunk.text));
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) {
      score += token.length >= 4 ? 3 : 1;
    } else if (chunk.text.toLowerCase().includes(token)) {
      score += 0.5;
    }
  }

  return score;
}

/**
 * 쿼리(블로그 주제/키워드)와 관련된 상위 청크를 키워드 매칭으로 검색합니다.
 */
export function searchKnowledge(
  query: string,
  allChunks: TextChunk[],
  maxChunks = config.knowledgeMaxChunks,
): TextChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || allChunks.length === 0) return [];

  const scored = allChunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const results: TextChunk[] = [];

  for (const { chunk } of scored) {
    const key = `${chunk.sourceFile}:${chunk.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(chunk);
    if (results.length >= maxChunks) break;
  }

  return results;
}

/**
 * PDF 지식 베이스에서 관련 컨텍스트를 검색해 프롬프트 주입용 문자열을 반환합니다.
 * PDF가 없거나 비활성화된 경우 null을 반환합니다.
 */
export async function retrieveKnowledgeContext(
  query: string,
): Promise<string | null> {
  if (!config.knowledgeEnabled) {
    return null;
  }

  const documents = await loadPdfs();
  if (documents.length === 0) {
    console.log(
      "[Knowledge] PDF 없음 — knowledge/ 폴더에 PDF를 넣으면 참고 자료가 주입됩니다",
    );
    return null;
  }

  const allChunks = documents.flatMap((doc) =>
    chunkText(doc.sourceFile, doc.text),
  );

  if (allChunks.length === 0) {
    console.log("[Knowledge] 추출된 텍스트 없음 — 지식 검색 생략");
    return null;
  }

  const topChunks = searchKnowledge(query, allChunks);
  if (topChunks.length === 0) {
    console.log(
      `[Knowledge] "${query}"와 관련된 청크 없음 — 지식 검색 생략`,
    );
    return null;
  }

  console.log(
    `[Knowledge] PDF ${documents.length}건 · 청크 ${allChunks.length}개 중 ${topChunks.length}개 주입`,
  );
  for (const chunk of topChunks) {
    console.log(
      `  · ${chunk.sourceFile} #${chunk.chunkIndex + 1} (${chunk.text.length}자)`,
    );
  }

  return buildKnowledgeContext(topChunks);
}
