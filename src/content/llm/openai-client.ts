import OpenAI from "openai";
import { config } from "../../../config/index.js";
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
  const response = await getClient().chat.completions.create({
    model: config.openaiModel,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI 응답이 비어 있습니다.");
  }

  return content;
}
