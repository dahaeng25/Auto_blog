import OpenAI from "openai";
import { config } from "../../../config/index.js";
import { logger } from "../../monitoring/logger.js";
import { retry } from "../../utils/retry.js";
import type { ChatOptions } from "./types.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수 또는 .env 파일을 확인하세요.",
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  return client;
}

/**
 * OpenAI Chat Completions API 래퍼.
 */
export async function openaiChat({
  system,
  user,
  temperature = 0.7,
}: ChatOptions): Promise<string> {
  const response = await retry(
    async () =>
      getClient().chat.completions.create({
        model: config.openaiModel,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    {
      attempts: Math.max(1, config.llmRetryAttempts),
      initialDelayMs: Math.max(200, config.llmRetryDelayMs),
      shouldRetry: (error) => {
        const status = Number((error as { status?: number })?.status ?? 0);
        const code = String((error as { code?: string })?.code ?? "");
        if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
        return [
          "ETIMEDOUT",
          "ECONNRESET",
          "ECONNREFUSED",
          "ENOTFOUND",
          "EAI_AGAIN",
        ].includes(code);
      },
      onRetry: (error, attempt, nextDelayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `[LLM/OpenAI] 요청 실패(시도 ${attempt}) → ${nextDelayMs}ms 후 재시도: ${message}`,
        );
      },
    },
  );

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI 응답이 비어 있습니다.");
  }

  return content;
}
