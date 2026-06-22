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

function pickSceneForSection(
  keywords: string[],
  slug: string,
  sectionTitle: string,
  sectionIndex: number,
): string {
  const haystack = `${keywords.join(" ")} ${sectionTitle}`.toLowerCase();

  if (/결혼|배우자|f-6|f6|혼인/.test(haystack)) {
    return "wedding rings and marriage certificate documents on desk with soft lighting, no people, no faces";
  }
  if (/창업|사업|투자|d-8|d8|법인/.test(haystack)) {
    return "startup business plan documents, laptop and coffee on modern office desk, wide shot, no people";
  }
  if (/비자|체류|출입국|immigration|visa/.test(haystack)) {
    return "passport, visa application forms and official stamp on wooden desk, top-down view, no people";
  }
  if (/서류|준비|신청|접수/.test(haystack)) {
    return "organized stack of official application documents and folders on office desk, no people";
  }
  if (/절차|과정|단계|방법/.test(haystack)) {
    return "flowchart papers and checklist clipboard on professional desk, wide angle, no people";
  }
  if (/요건|자격|조건|심사/.test(haystack)) {
    return "magnifying glass over official documents on desk, compliance review concept, no people";
  }

  const seed =
    slug.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    sectionTitle.length +
    sectionIndex;
  return SCENE_VARIANTS[seed % SCENE_VARIANTS.length];
}

function buildBackgroundPrompt(
  keywords: string[],
  slug: string,
  sectionTitle?: string,
  sectionIndex?: number,
): string {
  const topic = keywords.join(", ");
  const title = sectionTitle ?? topic;
  const scene = sectionTitle
    ? pickSceneForSection(keywords, slug, sectionTitle, sectionIndex ?? 0)
    : SCENE_VARIANTS[pickSceneIndex(keywords, slug) % SCENE_VARIANTS.length];
  const sectionContext = sectionTitle
    ? `This image is for the blog section titled "${sectionTitle}". `
    : "";

  return (
    `Professional photorealistic stock photo for a Korean administrative scrivener blog. ` +
    `Article topic: ${topic}. ${sectionContext}` +
    `Visual scene: ${scene}. ` +
    `Bright natural lighting, trustworthy corporate mood, square 1:1 composition, high detail. ` +
    `STRICT: No text, no logos, no watermarks, no Korean/English letters in image. ` +
    `STRICT: No single-person portrait, no headshot, no close-up face, no selfie. ` +
    `Prefer wide shots, environments, objects, documents, architecture.`
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
  return generateSectionBackground(keywords, keywords.join(", "), slug, 0);
}

/**
 * 단락(h2) 주제에 맞는 서브썸네일 배경 사진 생성.
 */
export async function generateSectionBackground(
  keywords: string[],
  sectionTitle: string,
  slug: string,
  sectionIndex: number,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn("[Thumbnail] OPENAI_API_KEY 없음 — AI 배경 생략, 기본 배경 사용");
    return null;
  }

  const dir = path.join(config.thumbnailsDir, "backgrounds");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${slug}_s${sectionIndex}_${Date.now()}.png`;
  const outputPath = path.join(dir, filename);
  const prompt = buildBackgroundPrompt(keywords, slug, sectionTitle, sectionIndex);
  const scene = sectionTitle
    ? pickSceneForSection(keywords, slug, sectionTitle, sectionIndex)
    : SCENE_VARIANTS[pickSceneIndex(keywords, slug) % SCENE_VARIANTS.length];

  console.log(
    `[Thumbnail] 배경 생성 중 — 키워드: ${keywords.join(", ")}, 단락: ${sectionTitle}`,
  );
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
