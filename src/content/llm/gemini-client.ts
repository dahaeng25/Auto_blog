import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config/index.js";
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

  const result = await model.generateContent(user);
  const content = result.response.text()?.trim();

  if (!content) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  return content;
}
