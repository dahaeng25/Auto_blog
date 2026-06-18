import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "../../config/index.js";

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. 썸네일 배경 생성에 API 키가 필요합니다.",
    );
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function buildBackgroundPrompt(keywords: string[]): string {
  const topic = keywords.join(", ");
  return (
    `Professional photorealistic photograph for a Korean business and immigration law blog. ` +
    `Theme: ${topic}. ` +
    `Modern bright office, consultation room, or relevant professional workplace in Korea. ` +
    `Warm natural lighting, trustworthy corporate atmosphere. ` +
    `Square composition, subject centered, shallow depth of field. ` +
    `No text, no letters, no logos, no watermarks, no UI elements.`
  );
}

/**
 * 메인 키워드에 맞는 썸네일 배경 사진을 생성해 저장합니다.
 */
export async function generateThumbnailBackground(
  keywords: string[],
  slug: string,
): Promise<string> {
  const dir = path.join(config.thumbnailsDir, "backgrounds");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${slug}_${Date.now()}.png`;
  const outputPath = path.join(dir, filename);

  console.log(`[Thumbnail] 배경 생성 중 — 키워드: ${keywords.join(", ")}`);

  const client = getClient();
  const response = await client.images.generate({
    model: config.thumbnailBackgroundModel,
    prompt: buildBackgroundPrompt(keywords),
    size: "1024x1024",
    n: 1,
  });

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) {
    throw new Error("OpenAI 이미지 생성 응답에 URL이 없습니다.");
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`배경 이미지 다운로드 실패: ${imageRes.status}`);
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  console.log(`[Thumbnail] 배경 저장: ${outputPath}`);
  return outputPath;
}
