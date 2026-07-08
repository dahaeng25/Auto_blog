import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "../../../config/index.js";
import { normalizeTopicInput } from "../resolve-blog-topic.js";
import {
  applyStyledBodyToWorkspace,
  readKeywordsFromFile,
  readWorkspaceMeta,
  updateWorkspaceThumbnailTexts,
} from "../draft-workspace.js";
import {
  buildTopLabelFromTitleAndKeywords,
  refreshThumbnailTexts,
  shouldRefreshThumbnailTexts,
} from "../../thumbnail/resolve-thumbnail-texts.js";

export type WorkflowStep =
  | "content"
  | "import"
  | "edit"
  | "thumbnail"
  | "thumbnail-preview"
  | "publish"
  | "full"
  | "import-full"
  | "import-resume"
  | "check-import";

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

export const DEFAULT_KEYWORDS_FILE = "blog-keywords.txt";
export const PLATFORM_NAVER = "naver";
export const PLATFORM_TISTORY = "tistory";
export const TOPIC_STATUS_PUBLISHED = "published";

/**
 * 실행 옵션으로부터 워크플로우 키워드를 결정한다.
 */
export async function resolveKeywords(
  options: WorkflowRunOptions,
): Promise<string> {
  // blog-run.bat cmd 인코딩 깨짐 방지 — 배치 모드는 파일에서 UTF-8로 읽기
  if (options.batchMode || options.keywordsFile) {
    try {
      return await readKeywordsFromFile(
        options.keywordsFile ?? DEFAULT_KEYWORDS_FILE,
      );
    } catch {
      if (!options.blogTopic?.trim()) throw new Error("키워드 파일을 읽을 수 없습니다.");
    }
  }

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

/**
 * 터미널에서 다음 단계 진행 여부를 확인한다.
 */
export async function promptContinue(
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

/**
 * Enter 입력을 기다려 수동 편집 타이밍을 제공한다.
 */
export async function waitForEnter(
  message: string,
  batchMode?: boolean,
): Promise<void> {
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

/**
 * 썸네일·업로드 전 본문 스타일을 워크스페이스에 적용한다.
 */
export async function ensureStyledBody(): Promise<void> {
  const styled = await applyStyledBodyToWorkspace();
  if (styled.length > 80) {
    console.log("[Style] body.html 에 블로그 서식을 적용했습니다.");
  }
}

/**
 * 제목/본문/키워드 변경 시 썸네일 문구를 동기화한다.
 */
export async function ensureThumbnailTextsSynced(
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

/**
 * 외부 원고 초기화 시 사용할 기본 상단 라벨을 생성한다.
 */
export function buildInitialTopLabel(keywords: string): string {
  return buildTopLabelFromTitleAndKeywords("", keywords);
}
