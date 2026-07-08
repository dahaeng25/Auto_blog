import { ensureWritableDirs } from "../../fs/ensure-writable-dirs.js";
import { pickBlogRegions, resolveBlogRegionInput } from "../../content/regions/pick-regions.js";
import {
  initImportWorkspace,
  isImportWorkspaceReady,
  loadDraftFromWorkspace,
  openDraftEditors,
  validateImportedDraft,
  writePreviewHtml,
} from "../draft-workspace.js";
import {
  buildInitialTopLabel,
  ensureStyledBody,
  ensureThumbnailTextsSynced,
  promptContinue,
  resolveKeywords,
  waitForEnter,
  type WorkflowRunOptions,
} from "./shared.js";
import { runPublishStep } from "./publish-step.js";
import { runThumbnailStep } from "./thumbnail-step.js";

/**
 * 외부 원고: 편집 폴더 준비 + 붙여넣기 안내 (Gems·Notebook LM).
 */
export async function runImportStep(
  options: WorkflowRunOptions,
): Promise<void> {
  await ensureWritableDirs();

  const keywords = await resolveKeywords(options);
  console.log(`\n[키워드] ${keywords} (썸네일·SEO용)`);

  const regionInput = await resolveBlogRegionInput(
    options.batchMode ? undefined : options.blogRegion,
  );
  const regionPick = regionInput ? pickBlogRegions(regionInput) : undefined;
  if (regionPick) {
    console.log(
      `[지역] ${regionPick.parentName} → ${regionPick.pickedShort.join("·")}`,
    );
  }

  const topLabel = buildInitialTopLabel(keywords);

  const workspace = await initImportWorkspace(
    keywords,
    regionPick
      ? { parentName: regionPick.parentName, pickedShort: regionPick.pickedShort }
      : undefined,
    { topLabel, mainText: "" },
  );

  await openDraftEditors();

  console.log("\n═══ 외부 원고 붙여넣기 ═══");
  console.log(`편집 폴더: ${workspace}`);
  console.log("\n다음 파일에 Gems·Notebook LM 원고를 붙여넣고 저장하세요:");
  console.log("  • title.txt      — 제목");
  console.log("  • body.html      — HTML 본문");
  console.log("\n저장 후:");
  console.log("  • 메모장에서 Ctrl+S 로 반드시 저장");
  console.log("  • [2] 전체(외부 원고) 또는 [5] 썸네일 생성");
  console.log("  • 썸네일 문구는 제목·본문 저장 후 자동 생성됩니다.");
}

/**
 * 외부 원고 저장 여부만 검사한다 (배치 사전 확인).
 */
export async function runCheckImportStep(): Promise<void> {
  const status = await isImportWorkspaceReady();
  if (!status.ready) {
    throw new Error(status.reason ?? "외부 원고가 준비되지 않았습니다.");
  }
  console.log("[Import] 제목·본문이 저장되어 있습니다.");
}

/**
 * 붙여넣기 완료 후 검증 + 썸네일 문구 동기화 + 썸네일 생성을 수행한다.
 */
export async function runImportResumeStep(): Promise<void> {
  await writePreviewHtml();

  const { keywords, draft } = await loadDraftFromWorkspace();
  validateImportedDraft(draft.title, draft.htmlBody);

  await ensureStyledBody();

  await ensureThumbnailTextsSynced(
    keywords,
    draft.title,
    draft.thumbnailTopLabel ?? "",
    draft.thumbnailText,
    draft.htmlBody,
  );

  await runThumbnailStep();
}

/**
 * 외부 원고 전체: 붙여넣기 → 썸네일 → 업로드 (대화형 터미널 전용).
 */
export async function runImportFullWorkflow(
  options: WorkflowRunOptions,
): Promise<void> {
  if (options.batchMode) {
    await runImportStep(options);
    return;
  }

  console.log("\n═══ 외부 원고 모드 (붙여넣기 → 썸네일 → 업로드) ═══\n");

  await runImportStep(options);

  await waitForEnter(
    "메모장에서 제목·본문을 붙여넣고 저장한 뒤,",
    options.batchMode,
  );

  await runImportResumeStep();

  const proceed = await promptContinue(
    "썸네일까지 완료했습니다. 업로드를 진행할까요?",
    options.batchMode,
  );
  if (!proceed) {
    console.log("\n업로드를 건너뜁니다. 나중에 [7] 업로드만 실행하세요.");
    return;
  }

  await runPublishStep();
  console.log("\n✅ 외부 원고 모드 전체 실행 완료");
}
