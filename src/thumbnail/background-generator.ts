import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "../../config/index.js";

const IMAGE_MODEL_FALLBACKS = ["dall-e-2", "dall-e-3", "gpt-image-1"] as const;

/** 사람 1명 초상 대신 사용할 장면 유형 */
const SCENE_VARIANTS = [
  "wide angle empty modern office with conference table, documents and laptops, no people",
  "official immigration documents, passport and rubber stamp on wooden desk, top-down view, no people",
  "harbor port and cargo ships aerial view, maritime industry, no people",
  "government administration building exterior, institutional architecture, no people",
  "empty consultation office interior with bookshelves and filing cabinets, wide shot",
  "contract papers and pen on desk with blurred office background, hands not visible",
  "city skyline and business district view through large office window, no people",
  "waiting lounge with empty chairs and reception desk, wide interior shot",
  "team collaboration shot from behind, several people at distance around table, not portrait",
  "Korean business district street and office towers, urban professional atmosphere",
] as const;

function getClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function uniqueModels(): string[] {
  const preferred = config.thumbnailBackgroundModel.trim();
  return [...new Set([preferred, ...IMAGE_MODEL_FALLBACKS].filter(Boolean))];
}

function pickSceneIndex(keywords: string[], slug: string): number {
  const seed =
    slug.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    keywords.join("").length +
    (Date.now() % SCENE_VARIANTS.length);
  return seed % SCENE_VARIANTS.length;
}

function buildBackgroundPrompt(keywords: string[], slug: string): string {
  const topic = keywords.join(", ");
  const scene = SCENE_VARIANTS[pickSceneIndex(keywords, slug)];

  return (
    `Professional stock photograph for a Korean administrative law and immigration blog article about: ${topic}. ` +
    `Scene: ${scene}. ` +
    `Photorealistic, bright natural lighting, trustworthy corporate mood, square 1:1 composition. ` +
    `STRICT: No text, no logos, no watermarks. ` +
    `STRICT: No single-person portrait, no headshot, no close-up face, no selfie, no one person as main subject. ` +
    `Prefer wide shots, environments, objects, architecture, or distant groups.`
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
  const prompt = buildBackgroundPrompt(keywords, slug);
  const scene = SCENE_VARIANTS[pickSceneIndex(keywords, slug)];

  console.log(`[Thumbnail] 배경 생성 중 — 키워드: ${keywords.join(", ")}`);
  console.log(`[Thumbnail] 장면 유형: ${scene}`);

  for (const model of uniqueModels()) {
    try {
      const response = await client.images.generate({
        model,
        prompt,
        size: imageSizeForModel(model),
        n: 1,
      });

      const data = response.data ?? [];
      const imageUrl = data[0]?.url;
      const b64 = data[0]?.b64_json;

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
