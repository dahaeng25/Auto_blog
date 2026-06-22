import type { Browser } from "playwright-core";
import { config } from "../../config/index.js";
import {
  buildSubThumbnailFilename,
  extractH2Titles,
} from "../publishing/images/keyword-slug.js";
import { launchChromium } from "../browser/launch-chromium.js";
import { generateSectionBackgroundsBatch } from "./background-generator.js";
import { SubThumbnailRenderer } from "./sub-thumbnail-renderer.js";

export interface GenerateSubThumbnailsInput {
  htmlBody: string;
  keywords: string[];
  keywordSlug: string;
  title: string;
}

export interface GeneratedSubThumbnail {
  path: string;
  sectionTitle: string;
  sequence: number;
  filename: string;
}

const MAX_SUB_THUMBNAILS = 10;

/**
 * h2 단락별 서브썸네일 생성 (700×700, 파일명 {제목슬러그}-{번호}.png).
 */
export async function generateSubThumbnails(
  input: GenerateSubThumbnailsInput,
): Promise<GeneratedSubThumbnail[]> {
  if (!config.subThumbnailEnabled) {
    console.log("[SubThumbnail] 비활성화됨 — 서브썸네일 생략");
    return [];
  }

  const h2Titles = extractH2Titles(input.htmlBody).slice(0, MAX_SUB_THUMBNAILS);
  if (h2Titles.length === 0) {
    console.warn("[SubThumbnail] h2 소제목 없음 — 서브썸네일 생략");
    return [];
  }

  const renderer = new SubThumbnailRenderer();
  const useAiBackground = config.subThumbnailDynamicBackground;

  console.log(
    `[SubThumbnail] ${h2Titles.length}개 단락 썸네일 생성 시작` +
      (useAiBackground
        ? ` (AI 배경, 동시 ${config.subThumbnailBgConcurrency}건)`
        : " (그라데이션 배경)"),
  );

  let backgroundPaths: Array<string | null> = h2Titles.map(() => null);

  if (useAiBackground) {
    const started = Date.now();
    backgroundPaths = await generateSectionBackgroundsBatch(
      h2Titles.map((sectionTitle, i) => ({
        keywords: input.keywords,
        sectionTitle,
        slug: input.keywordSlug,
        sectionIndex: i,
      })),
    );
    const aiCount = backgroundPaths.filter(Boolean).length;
    console.log(
      `[SubThumbnail] AI 배경 ${aiCount}/${h2Titles.length}건 완료 (${Math.round((Date.now() - started) / 1000)}초)`,
    );
    if (aiCount < h2Titles.length) {
      console.warn(
        `[SubThumbnail] ${h2Titles.length - aiCount}건은 그라데이션 폴백`,
      );
    }
  }

  const renderItems = h2Titles.map((sectionTitle, i) => ({
    sectionTitle,
    backgroundPath: backgroundPaths[i] ?? null,
    outputFilename: buildSubThumbnailFilename(input.title, i + 2),
  }));

  const browser = await launchChromium({ headless: true });
  try {
    const paths = await renderer.renderBatch(browser, renderItems);
    const results: GeneratedSubThumbnail[] = paths.map((path, i) => ({
      path,
      sectionTitle: h2Titles[i]!,
      sequence: i + 2,
      filename: renderItems[i]!.outputFilename,
    }));

    console.log(`[SubThumbnail] 완료: ${results.length}개`);
    return results;
  } finally {
    await browser.close();
  }
}
