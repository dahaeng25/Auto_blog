import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config/index.js";
import { logger } from "../../monitoring/logger.js";
import { retry } from "../../utils/retry.js";
import type { ChatOptions } from "./types.js";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!config.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }

  if (!client) {
    client = new GoogleGenerativeAI(config.geminiApiKey);
  }

  return client;
}

/**
 * Google Gemini API 래퍼.
 * Gems 시스템 프롬프트를 systemInstruction으로 주입합니다.
 */
export async function geminiChat({
  system,
  user,
  temperature = 0.7,
}: ChatOptions): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: system,
    generationConfig: { temperature },
  });

  const result = await retry(() => model.generateContent(user), {
    attempts: Math.max(1, config.llmRetryAttempts),
    initialDelayMs: Math.max(200, config.llmRetryDelayMs),
    shouldRetry: (error) => {
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("429") ||
        message.includes("quota") ||
        message.includes("rate") ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("500")
      );
    },
    onRetry: (error, attempt, nextDelayMs) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[LLM/Gemini] 요청 실패(시도 ${attempt}) → ${nextDelayMs}ms 후 재시도: ${message}`,
      );
    },
  });
  const content = result.response.text()?.trim();

  if (!content) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  return content;
}
