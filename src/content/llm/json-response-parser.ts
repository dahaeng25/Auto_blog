interface JsonResponseParserOptions<T> {
  source: string;
  context: string;
  requiredKeys: (keyof T)[];
}

interface JsonResponseParserResult<T> {
  parsed: Partial<T>;
  rawJson: string;
}

function safeExcerpt(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.slice(0, limit);
}

export function parseJsonResponse<T>(
  options: JsonResponseParserOptions<T>,
): JsonResponseParserResult<T> {
  const { source, context, requiredKeys } = options;
  const jsonMatch = source.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`[${context}] JSON 추출 실패: ${safeExcerpt(source)}`);
    throw new Error(`${context} 응답에서 JSON을 찾을 수 없습니다.`);
  }

  const rawJson = jsonMatch[0];
  let parsed: Partial<T>;
  try {
    parsed = JSON.parse(rawJson) as Partial<T>;
  } catch {
    console.warn(`[${context}] JSON 파싱 실패: ${safeExcerpt(source)}`);
    throw new Error(`${context} 응답 JSON 파싱에 실패했습니다.`);
  }

  const missingKeys = requiredKeys.filter((key) => {
    const value = parsed[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingKeys.length > 0) {
    const keyList = missingKeys.map(String).join(", ");
    console.warn(`[${context}] 필수 키 누락(${keyList}): ${safeExcerpt(source)}`);
    throw new Error(`${context} 응답 JSON에 필수 필드가 누락되었습니다: ${keyList}`);
  }

  return { parsed, rawJson };
}
