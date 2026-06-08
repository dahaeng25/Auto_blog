import OpenAI from "openai";
import { config } from "../../../config/index.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  return client;
}

export interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
}

/**
 * OpenAI Chat Completions API 래퍼.
 * 모든 에이전트는 이 함수를 통해 LLM을 호출합니다.
 */
export async function chat({
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
