import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs/promises";
import { config, getEnabledPlatforms } from "../../config/index.js";
import { ContentPipeline } from "../content/content-pipeline.js";
import { TopicRepository } from "../content/farming/topic-repository.js";
import { ensureWritableDirs } from "../fs/ensure-writable-dirs.js";
import { logger } from "../monitoring/logger.js";
import { prepareNaverImageSet } from "../publishing/images/prepare-naver-images.js";
import {
  buildKeywordSlug,
  buildTopLabelFromKeywords,
  extractMainKeywords,
} from "../publishing/images/keyword-slug.js";
import { PublishPipeline } from "../publishing/publish-pipeline.js";
import { ThumbnailRenderer } from "../thumbnail/thumbnail-renderer.js";
import { normalizeTopicInput } from "./resolve-blog-topic.js";
import {
  exportDraftWorkspace,
  getWorkspaceDir,
  loadDraftFromWorkspace,
  openDraftEditors,
  openPathInViewer,
  readKeywordsFromFile,
  saveThumbnailPath,
  workspaceExists,
  writePreviewHtml,
} from "./draft-workspace.js";

export type WorkflowStep =
  | "content"
  | "edit"
  | "thumbnail"
  | "thumbnail-preview"
  | "publish"
  | "full";

export interface WorkflowRunOptions {
  step: WorkflowStep;
  /** 배치파일 상단 등에서 직접 전달한 키워드 */
  blogTopic?: string;
  keywordsFile?: string;
  skipEditPrompt?: boolean;
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

async function promptContinue(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`\n${message} (y/N) > `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`\n${message}\nEnter를 누르면 계속합니다...`);
  } finally {
    rl.close();
  }
}

/** Phase 2: AI 글 작성 + 편집 폴더 저장 */
export async function runContentStep(
  options: WorkflowRunOptions,
): Promise<void> {
  await ensureWritableDirs();

  const keywords = await resolveKeywords(options);
  console.log(`\n[키워드] ${keywords}`);

  const pipeline = new ContentPipeline();
  try {
    const draft = await pipeline.run({ blogTopic: keywords });
    const workspace = await exportDraftWorkspace(draft, keywords);

    console.log("\n─── 글 작성 완료 ───");
    console.log(`제목: ${draft.title}`);
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

/** 편집 파일 열기 */
export async function runEditStep(): Promise<void> {
  if (!(await workspaceExists())) {
    throw new Error("편집할 원고가 없습니다. 먼저 글 작성을 실행하세요.");
  }

  await openDraftEditors();
  console.log("\n─── 원고 편집 ───");
  console.log(`폴더: ${getWorkspaceDir()}`);
  console.log("메모장에서 수정 후 저장하세요. preview.html 로 본문 미리보기가 가능합니다.");
}

/** Phase 3: 썸네일 생성 */
export async function runThumbnailStep(): Promise<string> {
  await ensureWritableDirs();

  const { keywords, draft } = await loadDraftFromWorkspace();
  const keywordList = extractMainKeywords(keywords, draft.title);
  const keywordSlug = buildKeywordSlug(keywordList);
  const useNaverSample =
    config.naverUseSampleStyle && getEnabledPlatforms().includes("naver");

  const topLabel =
    draft.thumbnailTopLabel?.trim() ||
    buildTopLabelFromKeywords(keywordList);

  const renderer = new ThumbnailRenderer();
  const thumbnailPath = await renderer.render({
    text: draft.thumbnailText,
    topLabel,
    keywords: keywordList,
    keywordSlug,
    ...(useNaverSample ? { outputFilename: `${keywordSlug}1.png` } : {}),
  });

  await saveThumbnailPath(thumbnailPath);

  console.log("\n─── 썸네일 생성 완료 ───");
  console.log(`경로: ${thumbnailPath}`);
  return thumbnailPath;
}

/** Phase 4: 업로드 */
export async function runPublishStep(): Promise<void> {
  await ensureWritableDirs();

  const { keywords, draft, thumbnailPath: savedPath } =
    await loadDraftFromWorkspace();

  if (!savedPath) {
    throw new Error(
      "썸네일이 없습니다. 먼저 [4] 썸네일 생성을 실행하세요.",
    );
  }

  try {
    await fs.access(savedPath);
  } catch {
    throw new Error(`썸네일 파일을 찾을 수 없습니다: ${savedPath}`);
  }

  const keywordList = extractMainKeywords(keywords, draft.title);
  const keywordSlug = buildKeywordSlug(keywordList);
  const useNaverSample =
    config.naverUseSampleStyle && getEnabledPlatforms().includes("naver");

  let naverImages;
  if (useNaverSample) {
    naverImages = await prepareNaverImageSet({
      thumbnailPath: savedPath,
      htmlBody: draft.htmlBody,
      title: draft.title,
      blogTopic: keywords,
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
      if (allPublished) {
        await repo.updateStatus(draft.topicId, "published");
        logger.info(`주제 상태 업데이트: published (id=${draft.topicId})`);
      }
    } finally {
      repo.close();
    }
  }
}

/** 전체: 글작성 → 편집 → 썸네일 → 업로드 */
export async function runFullWorkflow(
  keywordsFile: string,
  options: { skipEditPrompt?: boolean } = {},
): Promise<void> {
  console.log("\n═══ 전체 실행 (글작성 → 검토 → 썸네일 → 업로드) ═══\n");

  await runContentStep(keywordsFile);

  if (!options.skipEditPrompt) {
    await runEditStep();
    await waitForEnter(
      "메모장에서 원고를 수정·저장한 뒤,",
    );
    await writePreviewHtml();
  }

  await runThumbnailStep();

  const proceed = await promptContinue("썸네일까지 완료했습니다. 업로드를 진행할까요?");
  if (!proceed) {
    console.log("\n업로드를 건너뜁니다. 나중에 [5] 업로드만 실행하세요.");
    return;
  }

  await runPublishStep();
  console.log("\n✅ 전체 실행 완료");
}

export async function runWorkflow(options: WorkflowRunOptions): Promise<void> {
  const keywordsFile = options.keywordsFile ?? DEFAULT_KEYWORDS_FILE;

  switch (options.step) {
    case "content":
      await runContentStep(keywordsFile);
      break;
    case "edit":
      await runEditStep();
      break;
    case "thumbnail":
      await runThumbnailStep();
      break;
    case "publish":
      await runPublishStep();
      break;
    case "full":
      await runFullWorkflow(keywordsFile, {
        skipEditPrompt: options.skipEditPrompt,
      });
      break;
    default:
      throw new Error(`알 수 없는 단계: ${options.step}`);
  }
}
