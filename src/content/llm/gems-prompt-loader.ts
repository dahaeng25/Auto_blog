import fs from "node:fs";
import path from "node:path";
import { config } from "../../../config/index.js";

import type { RegionPickResult } from "../regions/pick-regions.js";

/**
 * prompts/gems-system.prompt.md 에서 Gems 시스템 프롬프트를 로드합니다.
 * `---` 구분선 사이의 내용만 추출하고 {{REGION}} 등을 치환합니다.
 */
export function loadGemsSystemPrompt(region?: RegionPickResult): string {
  const promptPath = path.resolve(config.gemsPromptPath);

  if (!fs.existsSync(promptPath)) {
    throw new Error(
      `Gems 프롬프트 파일이 없습니다: ${promptPath}\n` +
        `prompts/gems-system.prompt.md 에 Gemini Gems 지시문을 붙여넣으세요.`,
    );
  }

  const raw = fs.readFileSync(promptPath, "utf-8");
  const blocks = raw.split(/^---$/m).map((b) => b.trim()).filter(Boolean);

  // 첫 블록은 안내 문구, 두 번째 블록이 실제 Gems 프롬프트
  const gemsPrompt = blocks.length >= 2 ? blocks[1] : blocks[0];

  if (!gemsPrompt || gemsPrompt.includes("여기에 Gems 프롬프트를 붙여넣으세요")) {
    throw new Error(
      `Gems 프롬프트가 비어 있습니다.\n` +
        `${promptPath} 파일의 --- 구분선 사이에 Gems 지시문을 붙여넣으세요.`,
    );
  }

  return applyRegionPlaceholders(gemsPrompt, region);
}

function applyRegionPlaceholders(
  prompt: string,
  region?: RegionPickResult,
): string {
  const regionName = region?.parentName ?? "해당 지역";
  const localities = region?.pickedShort.join("·") ?? "지정된 시·군·구";

  return prompt
    .replace(/\{\{REGION\}\}/g, regionName)
    .replace(/\{\{LOCALITIES\}\}/g, localities);
}
