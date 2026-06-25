import { chat } from "../llm/llm-router.js";
import {
  THUMBNAIL_TEXT_SYSTEM_PROMPT,
  buildThumbnailTextUserPrompt,
} from "../llm/prompts/thumbnail-text.prompt.js";
import { normalizeThumbnailLineBreaks } from "../../thumbnail/normalize-thumbnail-line-breaks.js";

/**
 * 썸네일 텍스트 에이전트: 썸네일 중앙에 들어갈 짧은 문구를 생성합니다.
 */
export class ThumbnailTextAgent {
  async run(
    title: string,
    keywords: string,
    htmlBody?: string,
  ): Promise<string> {
    console.log("[ThumbnailText] 썸네일 문구 생성 중...");
    console.log(`[ThumbnailText] 제목: ${title.slice(0, 50)}`);

    const text = await chat({
      system: THUMBNAIL_TEXT_SYSTEM_PROMPT,
      user: buildThumbnailTextUserPrompt(title, keywords, htmlBody),
      temperature: 0.7,
    });

    const normalized = normalizeThumbnailLineBreaks(text);
    console.log(`[ThumbnailText] 생성 완료: "${normalized}"`);
    return normalized;
  }
}
