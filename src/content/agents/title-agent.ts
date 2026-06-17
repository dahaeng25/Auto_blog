import { chat } from "../llm/llm-router.js";
import {
  TITLE_SYSTEM_PROMPT,
  buildTitleUserPrompt,
} from "../llm/prompts/title.prompt.js";
import type { RawTopic } from "../types.js";

/**
 * 기획·제목 에이전트: SEO에 최적화된 블로그 제목을 생성합니다.
 */
export class TitleAgent {
  async run(topic: RawTopic): Promise<string> {
    console.log("[Title] SEO 제목 생성 중...");

    const title = await chat({
      system: TITLE_SYSTEM_PROMPT,
      user: buildTitleUserPrompt(topic),
      temperature: 0.8,
    });

    console.log(`[Title] 생성 완료: "${title}"`);
    return title;
  }
}
