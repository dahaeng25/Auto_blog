import { config } from "../../config/index.js";
import {
  buildSubThumbnailFilename,
  extractH2Titles,
} from "../publishing/images/keyword-slug.js";
import { generateSectionBackground } from "./background-generator.js";
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
  const results: GeneratedSubThumbnail[] = [];
  const useAiBackground = config.subThumbnailDynamicBackground;

  console.log(
    `[SubThumbnail] ${h2Titles.length}개 단락 썸네일 생성 시작` +
      (useAiBackground ? " (AI 배경)" : " (그라데이션 배경)"),
  );

  for (let i = 0; i < h2Titles.length; i++) {
    const sectionTitle = h2Titles[i]!;
    const sequence = i + 2;
    const filename = buildSubThumbnailFilename(input.title, sequence);

    let backgroundPath: string | null = null;
    if (useAiBackground) {
      backgroundPath = await generateSectionBackground(
        input.keywords,
        sectionTitle,
        input.keywordSlug,
        i,
      );
      if (!backgroundPath) {
        console.warn(
          `[SubThumbnail] AI 배경 실패 — 그라데이션 폴백 (${sectionTitle})`,
        );
      }
    }

    const path = await renderer.render({
      sectionTitle,
      backgroundPath,
      outputFilename: filename,
    });

    results.push({ path, sectionTitle, sequence, filename });
    console.log(`[SubThumbnail] ${i + 1}/${h2Titles.length}: ${filename}`);
  }

  console.log(`[SubThumbnail] 완료: ${results.length}개`);
  return results;
}
