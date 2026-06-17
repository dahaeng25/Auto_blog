import { config } from "../../../config/index.js";
import { openaiChat } from "./openai-client.js";
import type { ChatOptions } from "./types.js";

/**
 * LLM_PROVIDER 설정에 따라 OpenAI 또는 Gemini로 라우팅합니다.
 * OpenAI 사용 시 @google/generative-ai 패키지는 불필요합니다.
 */
export async function chat(options: ChatOptions): Promise<string> {
  if (config.llmProvider === "gemini") {
    const { geminiChat } = await import("./gemini-client.js");
    return geminiChat(options);
  }
  return openaiChat(options);
}
