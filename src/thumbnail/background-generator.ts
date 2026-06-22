import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "../../config/index.js";

/** dall-e 시리즈는 계정/API에 따라 미지원인 경우가 많아 gpt-image-1 우선 */
const IMAGE_MODEL_FALLBACKS = [
  "gpt-image-1",
  "gpt-image-1-mini",
  "dall-e-3",
  "dall-e-2",
] as const;

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

/** 성공한 모델 캐시 / 실패 모델 스킵 (반복 API 호출 방지) */
let cachedWorkingModel: string | null = null;
const unavailableModels = new Set<string>();
const warnedModels = new Set<string>();

function getClient(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function uniqueModels(): string[] {
  const preferred = config.thumbnailBackgroundModel.trim();
  return [...new Set([preferred, ...IMAGE_MODEL_FALLBACKS].filter(Boolean))];
}

function modelsToTry(): string[] {
  if (cachedWorkingModel) return [cachedWorkingModel];
  return uniqueModels().filter((m) => !unavailableModels.has(m));
}

function markModelUnavailable(model: string, reason: string): void {
  unavailableModels.add(model);
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(`[Thumbnail] ${model} 사용 불가 — ${reason} (이후 생략)`);
  }
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

type ImageSize = "256x256" | "512x512" | "1024x1024" | "auto";

function imageSizeForModel(model: string): ImageSize {
  if (model.startsWith("gpt-image")) return "1024x1024";
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

async function generateWithModel(
  client: OpenAI,
  model: string,
  prompt: string,
  outputPath: string,
): Promise<boolean> {
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
    return true;
  }

  if (b64) {
    await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
    console.log(`[Thumbnail] 배경 저장 (${model}): ${outputPath}`);
    return true;
  }

  console.warn(`[Thumbnail] ${model} 응답에 이미지 없음`);
  return false;
}

function isModelUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /does not exist|not found|not available|invalid model|unsupported/i.test(
      msg,
    ) || /400/.test(msg)
  );
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

  const tryModels = modelsToTry();
  if (tryModels.length === 0) {
    console.warn("[Thumbnail] 사용 가능한 이미지 모델 없음 — 그라데이션 배경 사용");
    return null;
  }

  const dir = path.join(config.thumbnailsDir, "backgrounds");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${slug}_s${sectionIndex}_${Date.now()}.png`;
  const outputPath = path.join(dir, filename);
  const prompt = buildBackgroundPrompt(keywords, slug, sectionTitle, sectionIndex);

  console.log(
    `[Thumbnail] 배경 생성 — 단락: ${sectionTitle.slice(0, 40)}${sectionTitle.length > 40 ? "…" : ""}`,
  );

  for (const model of tryModels) {
    try {
      const ok = await generateWithModel(client, model, prompt, outputPath);
      if (ok) {
        cachedWorkingModel = model;
        return outputPath;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isModelUnavailableError(error)) {
        markModelUnavailable(model, msg);
      } else {
        console.warn(`[Thumbnail] ${model} 배경 생성 실패 — ${msg}`);
      }
    }
  }

  return null;
}

/** 여러 단락 배경을 병렬 생성 (동시 요청 수 제한) */
export async function generateSectionBackgroundsBatch(
  items: Array<{
    keywords: string[];
    sectionTitle: string;
    slug: string;
    sectionIndex: number;
  }>,
  concurrency = config.subThumbnailBgConcurrency,
): Promise<Array<string | null>> {
  const results: Array<string | null> = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i]!;
      results[i] = await generateSectionBackground(
        item.keywords,
        item.sectionTitle,
        item.slug,
        item.sectionIndex,
      );
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
