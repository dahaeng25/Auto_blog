import { config, getEnabledPlatforms } from "../../../config/index.js";
import {
  buildKeywordSlug,
  extractMainKeywords,
} from "../../publishing/images/keyword-slug.js";
import { ensureWritableDirs } from "../../fs/ensure-writable-dirs.js";
import { ThumbnailRenderer } from "../../thumbnail/thumbnail-renderer.js";
import { generateSubThumbnails } from "../../thumbnail/generate-sub-thumbnails.js";
import {
  loadDraftFromWorkspace,
  openPathInViewer,
  saveSubThumbnailPaths,
  saveThumbnailPath,
} from "../draft-workspace.js";
import { ensureStyledBody, ensureThumbnailTextsSynced, PLATFORM_NAVER } from "./shared.js";

/**
 * Phase 3: 썸네일 생성.
 */
export async function runThumbnailStep(): Promise<string> {
  await ensureWritableDirs();

  await ensureStyledBody();

  const { keywords, draft } = await loadDraftFromWorkspace();
  const thumbnailTexts = await ensureThumbnailTextsSynced(
    keywords,
    draft.title,
    draft.thumbnailTopLabel ?? "",
    draft.thumbnailText,
    draft.htmlBody,
  );

  const keywordList = extractMainKeywords(keywords, draft.title);
  const keywordSlug = buildKeywordSlug(keywordList);
  const useNaverSample =
    config.naverUseSampleStyle && getEnabledPlatforms().includes(PLATFORM_NAVER);

  const topLabel = thumbnailTexts.topLabel;
  const mainText = thumbnailTexts.mainText;

  const renderer = new ThumbnailRenderer();
  const thumbnailPath = await renderer.render({
    text: mainText,
    topLabel,
    keywords: keywordList,
    keywordSlug,
    ...(useNaverSample ? { outputFilename: `${keywordSlug}1.png` } : {}),
  });

  await saveThumbnailPath(thumbnailPath);

  const subThumbnails = await generateSubThumbnails({
    htmlBody: draft.htmlBody,
    keywords: keywordList,
    keywordSlug,
    title: draft.title,
  });
  await saveSubThumbnailPaths(subThumbnails.map((s) => s.path));

  console.log("\n─── 썸네일 생성 완료 ───");
  console.log(`메인: ${thumbnailPath}`);
  if (subThumbnails.length > 0) {
    console.log(`서브썸네일: ${subThumbnails.length}개`);
    for (const sub of subThumbnails) {
      console.log(`  • ${sub.filename} — ${sub.sectionTitle}`);
    }
  }
  return thumbnailPath;
}

/**
 * 썸네일 생성 후 이미지 뷰어 미리보기를 연다.
 */
export async function runThumbnailPreviewStep(): Promise<string> {
  const thumbnailPath = await runThumbnailStep();
  await openPathInViewer(thumbnailPath);
  console.log("썸네일 미리보기를 열었습니다.");
  return thumbnailPath;
}
