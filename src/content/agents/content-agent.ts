import { chat } from "../llm/openai-client.js";
import {
  CONTENT_SYSTEM_PROMPT,
  buildContentUserPrompt,
} from "../llm/prompts/content.prompt.js";
import type { RawTopic } from "../types.js";

/** LLM이 마크다운 코드블록으로 감쌌을 경우 HTML만 추출 */
function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

/**
 * 콘텐츠 에이전트: 서론-본론-결론 구조의 HTML 본문을 생성합니다.
 */
export class ContentAgent {
  async run(title: string, topic: RawTopic): Promise<string> {
    console.log("[Content] HTML 본문 생성 중...");

    const raw = await chat({
      system: CONTENT_SYSTEM_PROMPT,
      user: buildContentUserPrompt(title, topic),
      temperature: 0.7,
    });

    const htmlBody = extractHtml(raw);
    console.log(`[Content] 생성 완료 (${htmlBody.length}자)`);
    return htmlBody;
  }
}
