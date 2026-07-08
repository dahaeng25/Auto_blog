import fs from "node:fs";
import path from "node:path";
import { config } from "../../../config/index.js";
import { getBrandPlaceholders } from "../../../config/brand.js";

import type { RegionPickResult } from "../regions/pick-regions.js";

/**
 * prompts/gems-system.prompt.md 에서 Gems 시스템 프롬프트를 로드합니다.
 * `---` 구분선 사이의 내용만 추출하고 {{REGION}} 등을 치환합니다.
 */
export function loadGemsSystemPrompt(region?: RegionPickResult): string {
  const splitPrompt = tryLoadSplitPrompts();
  const prompt = splitPrompt ?? loadLegacyPrompt(config.gemsPromptPath);
  return applyPlaceholders(prompt, region);
}

function applyPlaceholders(
  prompt: string,
  region?: RegionPickResult,
): string {
  const regionName = region?.parentName ?? "해당 지역";
  const localities = region?.pickedShort.join("·") ?? "지정된 시·군·구";
  const brandPlaceholders = getBrandPlaceholders();

  let out = prompt
    .replace(/\{\{REGION\}\}/g, regionName)
    .replace(/\{\{LOCALITIES\}\}/g, localities);

  for (const [key, value] of Object.entries(brandPlaceholders)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  return out;
}

function loadLegacyPrompt(promptPathLike: string): string {
  const promptPath = path.resolve(promptPathLike);
  if (!fs.existsSync(promptPath)) {
    throw new Error(
      `Gems 프롬프트 파일이 없습니다: ${promptPath}\n` +
        `prompts/gems-system.prompt.md 또는 분리 프롬프트 파일을 확인하세요.`,
    );
  }

  const raw = fs.readFileSync(promptPath, "utf-8");
  const blocks = raw.split(/^---$/m).map((b) => b.trim()).filter(Boolean);
  const gemsPrompt = blocks.length >= 2 ? blocks[1] : blocks[0];

  if (!gemsPrompt || gemsPrompt.includes("여기에 Gems 프롬프트를 붙여넣으세요")) {
    throw new Error(
      `Gems 프롬프트가 비어 있습니다.\n` +
        `${promptPath} 파일의 --- 구분선 사이 또는 분리 프롬프트 파일을 채우세요.`,
    );
  }

  return gemsPrompt;
}

function tryLoadSplitPrompts(): string | null {
  const promptsDir = path.join(config.projectRoot, "prompts");
  const files: Array<{ name: string; title: string }> = [
    { name: "persona.prompt.md", title: "PERSONA" },
    { name: "structure.prompt.md", title: "STRUCTURE" },
    { name: "content-rules.prompt.md", title: "CONTENT RULES" },
    { name: "output-schema.prompt.md", title: "OUTPUT SCHEMA" },
  ];

  const loadedParts: string[] = [];
  for (const file of files) {
    const filePath = path.join(promptsDir, file.name);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) {
      console.warn(`[Gems] 분리 프롬프트가 비어 있어 레거시로 대체: ${file.name}`);
      return null;
    }

    loadedParts.push(`${file.title}\n${content}`);
  }

  return loadedParts.join("\n\n");
}
