import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs/promises";
import { config, getEnabledPlatforms } from "../../config/index.js";
import { ContentPipeline } from "../content/content-pipeline.js";
import { TopicRepository } from "../content/farming/topic-repository.js";
import { ensureWritableDirs } from "../fs/ensure-writable-dirs.js";
import { logger } from "../monitoring/logger.js";
import { notifyError, notifySuccess } from "../monitoring/discord-notifier.js";
import { persistPublishedPosts } from "../content/seo/persist-published-posts.js";
import { prepareNaverImageSet } from "../publishing/images/prepare-naver-images.js";
import {
  buildKeywordSlug,
  buildSubThumbnailFilename,
  extractH2Titles,
  extractMainKeywords,
} from "../publishing/images/keyword-slug.js";
import { PublishPipeline } from "../publishing/publish-pipeline.js";
import { ThumbnailRenderer } from "../thumbnail/thumbnail-renderer.js";
import { generateSubThumbnails } from "../thumbnail/generate-sub-thumbnails.js";
import { normalizeTopicInput } from "./resolve-blog-topic.js";
import { resolveBlogRegionInput, pickBlogRegions } from "../content/regions/pick-regions.js";
import {
  exportDraftWorkspace,
  getWorkspaceDir,
  initImportWorkspace,
  loadDraftFromWorkspace,
  openDraftEditors,
  openPathInViewer,
  readKeywordsFromFile,
  readWorkspaceMeta,
  saveThumbnailPath,
  saveSubThumbnailPaths,
  updateWorkspaceThumbnailTexts,
  validateImportedDraft,
  workspaceExists,
  writePreviewHtml,
} from "./draft-workspace.js";
import {
  refreshThumbnailTexts,
  shouldRefreshThumbnailTexts,
  buildTopLabelFromTitleAndKeywords,
} from "../thumbnail/resolve-thumbnail-texts.js";

export type WorkflowStep =
  | "content"
  | "import"
  | "edit"
  | "thumbnail"
  | "thumbnail-preview"
  | "publish"
  | "full"
  | "import-full"
  | "import-resume";

export type WorkflowMode = "ai" | "import";

export interface WorkflowRunOptions {
  step: WorkflowStep;
  /** 배치파일 상단 등에서 직접 전달한 키워드 */
  blogTopic?: string;
  /** 도·광역시명 (시군구 자동 랜덤 선택) */
  blogRegion?: string;
  keywordsFile?: string;
  skipEditPrompt?: boolean;
  /** blog-run.bat — Node readline 대신 배치 pause 사용 */
  batchMode?: boolean;
}

const DEFAULT_KEYWORDS_FILE = "blog-keywords.txt";

async function resolveKeywords(options: WorkflowRunOptions): Promise<string> {
  const direct = options.blogTopic?.trim();
  if (direct) {
    return normalizeTopicInput(direct);
  }
  if (options.keywordsFile) {
    return readKeywordsFromFile(options.keywordsFile);
  }
  try {
    return readKeywordsFromFile(DEFAULT_KEYWORDS_FILE);
  } catch {
    throw new Error(
      "키워드가 없습니다.\n" +
        "  • blog-run.bat 상단의 BLOG_KEYWORDS 를 수정하거나\n" +
        "  • --topic \"키워드1, 키워드2\" 로 전달하세요.",
    );
  }
}

async function promptContinue(
  message: string,
  batchMode?: boolean,
): Promise<boolean> {
  if (batchMode) {
    console.log(`\n${message} — 배치 메뉴에서 업로드 [7]을 선택하세요.`);
    return false;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`\n${message} (y/N) > `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function waitForEnter(message: string, batchMode?: boolean): Promise<void> {
  if (batchMode) {
    console.log(`\n${message}`);
    console.log("(배치 파일에서 아무 키나 누르면 다음 단계로 진행됩니다)");
    return;
  }
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`\n${message}\nEnter를 누르면 계속합니다...`);
  } finally {
    rl.close();
  }
}

/** 썸네일 문구를 키워드·제목에 맞게 동기화 */
async function ensureThumbnailTextsSynced(
  keywords: string,
  title: string,
  topLabel: string,
  mainText: string,
  htmlBody?: string,
): Promise<{ topLabel: string; mainText: string }> {
  const meta = await readWorkspaceMeta();
  const needsRefresh =
    shouldRefreshThumbnailTexts(
      meta?.keywords,
      keywords,
      title,
      topLabel,
      mainText,
      htmlBody,
    ) ||
    (meta?.savedTitle && meta.savedTitle !== title.trim());

  if (!needsRefresh) {
    return { topLabel, mainText };
  }

  console.log("[Thumbnail] 제목·본문에 맞게 썸네일 문구를 생성합니다...");
  const refreshed = await refreshThumbnailTexts(keywords, title, htmlBody);
  await updateWorkspaceThumbnailTexts(
    refreshed.topLabel,
    refreshed.mainText,
    keywords,
    title,
  );
  console.log(`[Thumbnail] 상단: ${refreshed.topLabel}`);
  console.log(`[Thumbnail] 가운데: ${refreshed.mainText.replace(/\n/g, " / ")}`);
  return refreshed;
}

/** Phase 2: AI 글 작성 + 편집 폴더 저장 */
export async function runContentStep(
  options: WorkflowRunOptions,
): Promise<void> {
  await ensureWritableDirs();

  const keywords = await resolveKeywords(options);
  console.log(`\n[키워드] ${keywords}`);

  const regionInput = await resolveBlogRegionInput(options.blogRegion);
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

/** 외부 원고: 편집 폴더 준비 + 붙여넣기 안내 (Gems·Notebook LM) */
export async function runImportStep(
  options: WorkflowRunOptions,
): Promise<void> {
  await ensureWritableDirs();

  const keywords = await resolveKeywords(options);
  console.log(`\n[키워드] ${keywords} (썸네일·SEO용)`);

  const regionInput = await resolveBlogRegionInput(options.blogRegion);
  const regionPick = regionInput ? pickBlogRegions(regionInput) : undefined;
  if (regionPick) {
    console.log(
      `[지역] ${regionPick.parentName} → ${regionPick.pickedShort.join("·")}`,
    );
  }

  const topLabel = buildTopLabelFromTitleAndKeywords("", keywords);

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
  console.log("  • [2] 전체(외부 원고) 또는 [5] 썸네일 생성");
  console.log("  • 썸네일 문구는 제목·본문 저장 후 자동 생성됩니다.");
}

/** 붙여넣기 완료 후 — 검증 + 썸네일 문구 동기화 + 썸네일 생성 */
export async function runImportResumeStep(): Promise<void> {
  await writePreviewHtml();

  const { keywords, draft } = await loadDraftFromWorkspace();
  validateImportedDraft(draft.title, draft.htmlBody);

  await ensureThumbnailTextsSynced(
    keywords,
    draft.title,
    draft.thumbnailTopLabel ?? "",
    draft.thumbnailText,
    draft.htmlBody,
  );

  await runThumbnailStep();
}

/** 외부 원고 전체: 붙여넣기 → 썸네일 → 업로드 (대화형 터미널 전용) */
export async function runImportFullWorkflow(
  options: WorkflowRunOptions,
): Promise<void> {
  if (options.batchMode) {
    await runImportStep(options);
    return;
  }

  console.log(
    "\n═══ 외부 원고 모드 (붙여넣기 → 썸네일 → 업로드) ═══\n",
  );

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

/** 편집 파일 열기 */
export async function runEditStep(): Promise<void> {
  if (!(await workspaceExists())) {
    throw new Error("편집할 원고가 없습니다. 먼저 글 작성을 실행하세요.");
  }

  await openDraftEditors();
  console.log("\n─── 원고 편집 ───");
  console.log(`폴더: ${getWorkspaceDir()}`);
  console.log("메모장에서 수정 후 저장하세요.");
  console.log("미리보기: output/drafts/current/preview.html (필요 시 직접 열기)");
}

/** Phase 3: 썸네일 생성 */
export async function runThumbnailStep(): Promise<string> {
  await ensureWritableDirs();

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
    config.naverUseSampleStyle && getEnabledPlatforms().includes("naver");

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

/** 썸네일 생성 후 이미지 뷰어로 미리보기 */
export async function runThumbnailPreviewStep(): Promise<string> {
  const thumbnailPath = await runThumbnailStep();
  await openPathInViewer(thumbnailPath);
  console.log("썸네일 미리보기를 열었습니다.");
  return thumbnailPath;
}

/** Phase 4: 업로드 */
export async function runPublishStep(): Promise<void> {
  await ensureWritableDirs();

  const { keywords, draft, thumbnailPath: savedPath, subThumbnailPaths } =
    await loadDraftFromWorkspace();

  if (!savedPath) {
    throw new Error(
      "썸네일이 없습니다. 먼저 [5] 썸네일 생성을 실행하세요.",
    );
  }

  try {
    await fs.access(savedPath);
  } catch {
    throw new Error(`썸네일 파일을 찾을 수 없습니다: ${savedPath}`);
  }

  const keywordList = extractMainKeywords(keywords, draft.title);
  const keywordSlug = buildKeywordSlug(keywordList);
  const enabledPlatforms = getEnabledPlatforms();
  const needsPreparedImages =
    enabledPlatforms.includes("naver") || enabledPlatforms.includes("tistory");

  let naverImages;
  if (needsPreparedImages) {
    const h2Titles = extractH2Titles(draft.htmlBody);
    const subThumbnails = (subThumbnailPaths ?? []).map((p, i) => ({
      path: p,
      sectionTitle: h2Titles[i] ?? `단락 ${i + 1}`,
      sequence: i + 2,
      filename: buildSubThumbnailFilename(draft.title, i + 2),
    }));

    naverImages = await prepareNaverImageSet({
      thumbnailPath: savedPath,
      htmlBody: draft.htmlBody,
      title: draft.title,
      blogTopic: keywords,
      subThumbnails: subThumbnails.length > 0 ? subThumbnails : undefined,
    });
  }

  const publishPipeline = new PublishPipeline();
  const results = await publishPipeline.run({
    title: draft.title,
    htmlBody: draft.htmlBody,
    thumbnailPath: naverImages?.thumbnail.absolutePath ?? savedPath,
    blogTopic: keywords,
    naverImages,
  });

  console.log("\n─── 업로드 결과 ───");
  for (const r of results) {
    console.log(
      `[${r.platform}] ${r.success ? "성공" : "실패"}${r.postUrl ? ` → ${r.postUrl}` : ""}`,
    );
  }

  if (config.publishDryRun) {
    console.log("\nℹ️  PUBLISH_DRY_RUN=true — 실제 발행은 수행되지 않았습니다.");
    console.log("   실제 발행: .env 에서 PUBLISH_DRY_RUN=false 설정");
  } else {
    const repo = new TopicRepository();
    try {
      const allPublished = results.every((r) => r.postUrl);
      if (allPublished && draft.topicId > 0) {
        await repo.updateStatus(draft.topicId, "published");
        logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);
      }

      if (allPublished) {
        await persistPublishedPosts({
          topicId: draft.topicId > 0 ? draft.topicId : undefined,
          title: draft.title,
          keywords,
          results,
        });

        await notifySuccess(draft.title, results);
      }
    } finally {
      repo.close();
    }
  }
}

/** 전체: AI 글작성 → 편집 → 썸네일 → 업로드 */
export async function runFullWorkflow(
  options: WorkflowRunOptions,
): Promise<void> {
  console.log(
    "\n═══ AI 자동 모드 (글작성 → 검토 → 썸네일 → 업로드) ═══\n",
  );

  await runContentStep(options);

  if (!options.skipEditPrompt) {
    if (options.batchMode) {
      console.log("\n[배치] 원고 검토는 메뉴 [4]에서 진행한 뒤 [5] 썸네일을 실행하세요.");
      return;
    }
    await runEditStep();
    await waitForEnter(
      "메모장에서 원고를 수정·저장한 뒤,",
      options.batchMode,
    );
    await writePreviewHtml();
  }

  await runThumbnailStep();

  const proceed = await promptContinue(
    "썸네일까지 완료했습니다. 업로드를 진행할까요?",
    options.batchMode,
  );
  if (!proceed) {
    console.log("\n업로드를 건너뜁니다. 나중에 [7] 업로드만 실행하세요.");
    return;
  }

  await runPublishStep();
  console.log("\n✅ AI 자동 모드 전체 실행 완료");
}

export async function runWorkflow(options: WorkflowRunOptions): Promise<void> {
  const stage = options.step;

  try {
    switch (options.step) {
      case "content":
        await runContentStep(options);
        break;
      case "import":
        await runImportStep(options);
        break;
      case "edit":
        await runEditStep();
        break;
      case "thumbnail":
        await runThumbnailStep();
        break;
      case "thumbnail-preview":
        await runThumbnailPreviewStep();
        break;
      case "publish":
        await runPublishStep();
        break;
      case "full":
        await runFullWorkflow(options);
        break;
      case "import-full":
        await runImportFullWorkflow(options);
        break;
      case "import-resume":
        await runImportResumeStep();
        break;
      default:
        throw new Error(`알 수 없는 단계: ${options.step}`);
    }
  } catch (error) {
    logger.error(
      `[Workflow:${stage}] ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }

    try {
      await notifyError(error, { stage: `workflow:${stage}` });
    } catch (notifyErr) {
      logger.error(
        `Discord 알림 전송 실패: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
      );
    }

    throw error;
  }
}
