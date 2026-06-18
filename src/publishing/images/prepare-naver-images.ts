import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../../config/index.js";
import { loadBodyImages } from "../body-images/image-manifest.js";
import {
  buildKeywordSlug,
  extractH2Titles,
  extractMainKeywords,
} from "./keyword-slug.js";

export interface PreparedImageAsset {
  absolutePath: string;
  filename: string;
  sequence: number;
  /** 이미지 alt / 대체 텍스트 */
  altText: string;
  /** 이미지 제목·설명 메타 (매 실행마다 고유 접미사 포함) */
  titleMeta: string;
  linkUrl?: string;
}

export interface NaverImageSet {
  keywordSlug: string;
  keywords: string[];
  thumbnail: PreparedImageAsset;
  bodyImages: PreparedImageAsset[];
}

function buildImageMeta(
  keywords: string[],
  title: string,
  sequence: number,
  context?: string,
): { altText: string; titleMeta: string } {
  const kw = keywords.join(" ");
  const ctx = context ? ` ${context}` : "";
  const unique = Date.now().toString(36).slice(-5);

  return {
    altText: `${kw}${ctx} 관련 이미지 ${sequence}`.slice(0, 120),
    titleMeta: `${title.slice(0, 40)}_${kw}_${sequence}_${unique}`.slice(0, 150),
  };
}

async function copyRenamed(
  sourcePath: string,
  destDir: string,
  filename: string,
): Promise<string> {
  await fs.mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, filename);
  await fs.copyFile(sourcePath, destPath);
  return destPath;
}

export interface PrepareNaverImagesInput {
  thumbnailPath: string;
  htmlBody: string;
  title: string;
  blogTopic?: string;
}

/**
 * blue_directors 샘플 이미지를 복사해 키워드 조합 파일명(1~)과
 * 매번 다른 메타(alt/title)를 부여합니다.
 */
export async function prepareNaverImageSet(
  input: PrepareNaverImagesInput,
): Promise<NaverImageSet> {
  const keywords = extractMainKeywords(input.blogTopic ?? "", input.title);
  const keywordSlug = buildKeywordSlug(keywords);
  const h2Titles = extractH2Titles(input.htmlBody);
  const runDir = path.join(
    config.outputDir,
    "naver-images",
    `${keywordSlug}_${Date.now()}`,
  );

  const thumbExt = path.extname(input.thumbnailPath) || ".png";
  const thumbFilename = `${keywordSlug}1${thumbExt}`;
  const thumbMeta = buildImageMeta(keywords, input.title, 1, "대표 썸네일");
  const thumbnailPath = await copyRenamed(
    input.thumbnailPath,
    runDir,
    thumbFilename,
  );

  const sourceBody = loadBodyImages();
  const bodyImages: PreparedImageAsset[] = [];

  for (let i = 0; i < sourceBody.length; i++) {
    const entry = sourceBody[i];
    const sequence = i + 2;
    const ext = path.extname(entry.absolutePath) || ".png";
    const filename = `${keywordSlug}${sequence}${ext}`;
    const context = h2Titles[i] ?? `본문 ${sequence - 1}`;
    const meta = buildImageMeta(keywords, input.title, sequence, context);
    const absolutePath = await copyRenamed(
      entry.absolutePath,
      runDir,
      filename,
    );

    bodyImages.push({
      absolutePath,
      filename,
      sequence,
      altText: meta.altText,
      titleMeta: meta.titleMeta,
      linkUrl: entry.linkUrl,
    });
  }

  console.log(
    `[NaverImages] 키워드=${keywords.join(", ")} → 파일 접두사 "${keywordSlug}"`,
  );
  console.log(`[NaverImages] 준비 완료: 썸네일 1개 + 본문 ${bodyImages.length}개`);

  return {
    keywordSlug,
    keywords,
    thumbnail: {
      absolutePath: thumbnailPath,
      filename: thumbFilename,
      sequence: 1,
      altText: thumbMeta.altText,
      titleMeta: thumbMeta.titleMeta,
    },
    bodyImages,
  };
}
