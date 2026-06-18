import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "../../config/index.js";

const IMAGE_MODEL_FALLBACKS = ["dall-e-2", "dall-e-3", "gpt-image-1"] as const;

function getClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function uniqueModels(): string[] {
  const preferred = config.thumbnailBackgroundModel.trim();
  return [...new Set([preferred, ...IMAGE_MODEL_FALLBACKS].filter(Boolean))];
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

function imageSizeForModel(model: string): "256x256" | "512x512" | "1024x1024" {
  if (model === "dall-e-2") return "512x512";
  return "1024x1024";
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const imageRes = await fetch(url);
  if (!imageRes.ok) {
    throw new Error(`배경 이미지 다운로드 실패: ${imageRes.status}`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

/**
 * 메인 키워드에 맞는 썸네일 배경 사진을 생성해 저장합니다.
 * 실패 시 null (그라데이션 폴백).
 */
export async function generateThumbnailBackground(
  keywords: string[],
  slug: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn("[Thumbnail] OPENAI_API_KEY 없음 — AI 배경 생략, 기본 배경 사용");
    return null;
  }

  const dir = path.join(config.thumbnailsDir, "backgrounds");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${slug}_${Date.now()}.png`;
  const outputPath = path.join(dir, filename);
  const prompt = buildBackgroundPrompt(keywords);

  console.log(`[Thumbnail] 배경 생성 중 — 키워드: ${keywords.join(", ")}`);

  for (const model of uniqueModels()) {
    try {
      const response = await client.images.generate({
        model,
        prompt,
        size: imageSizeForModel(model),
        n: 1,
      });

      const imageUrl = response.data[0]?.url;
      const b64 = response.data[0]?.b64_json;

      if (imageUrl) {
        await downloadImage(imageUrl, outputPath);
        console.log(`[Thumbnail] 배경 저장 (${model}): ${outputPath}`);
        return outputPath;
      }

      if (b64) {
        await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
        console.log(`[Thumbnail] 배경 저장 (${model}): ${outputPath}`);
        return outputPath;
      }

      console.warn(`[Thumbnail] ${model} 응답에 이미지 없음`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Thumbnail] ${model} 배경 생성 실패 — ${msg}`);
    }
  }

  console.warn("[Thumbnail] AI 배경 생성 실패 — 그라데이션 배경으로 대체합니다.");
  return null;
}
