import { ContentPipeline } from "../../content/content-pipeline.js";
import { ensureWritableDirs } from "../../fs/ensure-writable-dirs.js";
import { exportDraftWorkspace } from "../draft-workspace.js";
import { resolveBlogRegionInput } from "../../content/regions/pick-regions.js";
import {
  ensureThumbnailTextsSynced,
  resolveKeywords,
  type WorkflowRunOptions,
} from "./shared.js";

/**
 * Phase 2: AI 글 작성 + 편집 폴더 저장.
 */
export async function runContentStep(
  options: WorkflowRunOptions,
): Promise<void> {
  await ensureWritableDirs();

  const keywords = await resolveKeywords(options);
  console.log(`\n[키워드] ${keywords}`);

  const regionInput = await resolveBlogRegionInput(
    options.batchMode ? undefined : options.blogRegion,
  );
  console.log(`[지역 입력] ${regionInput}`);

  const pipeline = new ContentPipeline();
  try {
    const draft = await pipeline.run({
      blogTopic: keywords,
      blogRegion: regionInput,
      forceRegenerate: true,
    });

    if (draft.pickedLocalities?.length) {
      console.log(
        `[지역 적용] ${draft.blogRegion} → ${draft.pickedLocalities.join("·")}`,
      );
    }

    const thumbnailTexts = await ensureThumbnailTextsSynced(
      keywords,
      draft.title,
      draft.thumbnailTopLabel ?? "",
      draft.thumbnailText,
      draft.htmlBody,
    );

    const draftWithThumbnail = {
      ...draft,
      thumbnailTopLabel: thumbnailTexts.topLabel,
      thumbnailText: thumbnailTexts.mainText,
    };

    const workspace = await exportDraftWorkspace(
      draftWithThumbnail,
      keywords,
      draft.blogRegion && draft.pickedLocalities
        ? {
            parentName: draft.blogRegion,
            pickedShort: draft.pickedLocalities,
          }
        : undefined,
    );

    console.log("\n─── 글 작성 완료 ───");
    console.log(`제목: ${draftWithThumbnail.title}`);
    console.log(`편집 폴더: ${workspace}`);
    console.log("  • title.txt — 제목");
    console.log("  • body.html — 본문 (HTML)");
    console.log("  • thumbnail-top.txt — 썸네일 상단 라벨");
    console.log("  • thumbnail-main.txt — 썸네일 가운데 제목 (2줄은 Enter로 구분)");
    console.log("  • preview.html — 브라우저 미리보기");
  } finally {
    pipeline.close();
  }
}
