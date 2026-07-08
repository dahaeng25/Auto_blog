import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { config } from "../../config/index.js";
import {
  looksLikeMojibake,
  readLocalizedTextFile,
} from "../fs/read-localized-text-file.js";
import { normalizeTopicInput } from "./resolve-blog-topic.js";
import type { ArticleDraft } from "../content/types.js";
import { normalizeThumbnailLineBreaks } from "../thumbnail/normalize-thumbnail-line-breaks.js";
import { applyBlogStyle } from "../content/blog-style/apply-style.js";

export const CURRENT_WORKSPACE = path.join(config.draftsDir, "current");

const FILES = {
  keywords: "keywords.txt",
  title: "title.txt",
  body: "body.html",
  thumbnailTop: "thumbnail-top.txt",
  thumbnailMain: "thumbnail-main.txt",
  meta: "draft-meta.json",
  preview: "preview.html",
  thumbnailPath: "thumbnail-path.txt",
  subThumbnailPaths: "sub-thumbnail-paths.json",
} as const;

export interface DraftWorkspaceMeta {
  topicId: number;
  createdAt: string;
  keywords?: string;
  /** 마지막 썸네일 동기화 시점의 제목 */
  savedTitle?: string;
  blogRegion?: string;
  pickedLocalities?: string[];
  thumbnailPath?: string;
  subThumbnailPaths?: string[];
  /** Gems·Notebook LM 등 외부에서 붙여넣은 원고 */
  sourceMode?: "ai" | "import";
}

/** 외부 원고 붙여넣기 안내 (이 문자열이 남아 있으면 미작성으로 간주) */
export const IMPORT_TITLE_PLACEHOLDER =
  "(Gems 등에서 제목을 복사해 붙여넣으세요)";

export const IMPORT_BODY_PLACEHOLDER = `<!-- Gems·Notebook LM 등에서 작성한 HTML 본문을 아래에 붙여넣으세요 -->
<p>여기에 본문을 붙여넣으세요.</p>`;

export interface LoadedWorkspace {
  keywords: string;
  draft: ArticleDraft;
  thumbnailPath?: string;
  subThumbnailPaths?: string[];
}

/** 키워드 파일 읽기 (# 으로 시작하는 줄은 주석) */
export async function readKeywordsFromFile(
  filePath: string,
): Promise<string> {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(config.projectRoot, filePath);

  let content: string;
  try {
    content = await readLocalizedTextFile(abs);
  } catch {
    throw new Error(
      `키워드 파일을 찾을 수 없습니다: ${abs}\n` +
        "blog-keywords.txt 파일을 만들고 키워드를 입력하세요.",
    );
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length === 0) {
    throw new Error(
      `키워드가 비어 있습니다: ${abs}\n` +
        "주석(#) 아래에 키워드를 입력하세요. (예: D-8-4, 외국인 창업)",
    );
  }

  return normalizeTopicInput(lines.join(", "));
}

export async function workspaceExists(): Promise<boolean> {
  try {
    await fs.access(path.join(CURRENT_WORKSPACE, FILES.meta));
    return true;
  } catch {
    return false;
  }
}

/** AI 생성 원고를 편집용 폴더로보내기 */
export async function exportDraftWorkspace(
  draft: ArticleDraft,
  keywords: string,
  regionMeta?: { parentName: string; pickedShort: string[] },
): Promise<string> {
  await fs.mkdir(CURRENT_WORKSPACE, { recursive: true });

  const meta: DraftWorkspaceMeta = {
    topicId: draft.topicId,
    createdAt: draft.createdAt,
    keywords,
    sourceMode: "ai",
    ...(regionMeta
      ? {
          blogRegion: regionMeta.parentName,
          pickedLocalities: regionMeta.pickedShort,
        }
      : {}),
  };

  await Promise.all([
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.keywords),
      `${keywords}\n`,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.title),
      draft.title,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.body),
      draft.htmlBody,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailTop),
      draft.thumbnailTopLabel ?? "",
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailMain),
      draft.thumbnailText,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.meta),
      JSON.stringify(meta, null, 2),
      "utf-8",
    ),
    fs.rm(path.join(CURRENT_WORKSPACE, FILES.thumbnailPath), { force: true }),
  ]);

  await writePreviewHtml();
  return CURRENT_WORKSPACE;
}

/**
 * 외부 원고(Gems·Notebook LM 등) 붙여넣기용 편집 폴더를 초기화합니다.
 * AI 생성 없이 title.txt / body.html 에 직접 붙여넣습니다.
 */
export async function initImportWorkspace(
  keywords: string,
  regionMeta?: { parentName: string; pickedShort: string[] },
  thumbnailTexts?: { topLabel: string; mainText: string },
): Promise<string> {
  await fs.mkdir(CURRENT_WORKSPACE, { recursive: true });

  const meta: DraftWorkspaceMeta = {
    topicId: 0,
    createdAt: new Date().toISOString(),
    keywords,
    sourceMode: "import",
    ...(regionMeta
      ? {
          blogRegion: regionMeta.parentName,
          pickedLocalities: regionMeta.pickedShort,
        }
      : {}),
  };

  const topLabel = thumbnailTexts?.topLabel ?? "";
  const mainText = thumbnailTexts?.mainText ?? keywords;

  await Promise.all([
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.keywords),
      `${keywords}\n`,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.title),
      IMPORT_TITLE_PLACEHOLDER,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.body),
      IMPORT_BODY_PLACEHOLDER,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailTop),
      topLabel,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailMain),
      mainText,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.meta),
      JSON.stringify(meta, null, 2),
      "utf-8",
    ),
    fs.rm(path.join(CURRENT_WORKSPACE, FILES.thumbnailPath), { force: true }),
    fs.rm(path.join(CURRENT_WORKSPACE, FILES.subThumbnailPaths), {
      force: true,
    }),
  ]);

  await writePreviewHtml();
  return CURRENT_WORKSPACE;
}

/** 외부 원고가 실제로 채워졌는지 검사 */
export function validateImportedDraft(title: string, htmlBody: string): void {
  const t = title.trim();
  const b = htmlBody.trim();
  const titlePath = path.join(CURRENT_WORKSPACE, FILES.title);
  const bodyPath = path.join(CURRENT_WORKSPACE, FILES.body);

  if (!t || t === IMPORT_TITLE_PLACEHOLDER) {
    throw new Error(
      `제목이 비어 있습니다.\n` +
        `  파일: ${titlePath}\n` +
        `  메모장에서 Gems 등에서 작성한 제목을 붙여넣고 저장(Ctrl+S)한 뒤 다시 실행하세요.`,
    );
  }

  if (
    !b ||
    b === IMPORT_BODY_PLACEHOLDER.trim() ||
    b.includes("여기에 본문을 붙여넣으세요")
  ) {
    throw new Error(
      `본문이 비어 있습니다.\n` +
        `  파일: ${bodyPath}\n` +
        `  메모장에서 HTML 본문을 붙여넣고 저장(Ctrl+S)한 뒤 다시 실행하세요.`,
    );
  }

  if (b.length < 80) {
    throw new Error(
      "본문이 너무 짧습니다. body.html 내용을 확인하세요.",
    );
  }
}

/** 외부 원고 붙여넣기가 완료됐는지 (배치·CLI 사전 검사용) */
export async function isImportWorkspaceReady(): Promise<{
  ready: boolean;
  reason?: string;
}> {
  try {
    const title = (
      await fs.readFile(path.join(CURRENT_WORKSPACE, FILES.title), "utf-8")
    ).trim();
    const body = (
      await fs.readFile(path.join(CURRENT_WORKSPACE, FILES.body), "utf-8")
    ).trim();

    try {
      validateImportedDraft(title, body);
      return { ready: true };
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  } catch {
    return {
      ready: false,
      reason:
        "편집 폴더가 없습니다. [3] 붙여넣기 준비를 먼저 실행하세요.",
    };
  }
}

/** 편집 폴더에서 원고 읽기 */
export async function loadDraftFromWorkspace(): Promise<LoadedWorkspace> {
  const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
  try {
    await fs.access(metaPath);
  } catch {
    throw new Error(
      "편집용 원고가 없습니다. AI 글 작성 또는 [외부 원고] 붙여넣기를 먼저 실행하세요.",
    );
  }

  const [keywordsRaw, title, htmlBody, thumbnailTop, thumbnailMain, metaRaw] =
    await Promise.all([
      readLocalizedTextFile(path.join(CURRENT_WORKSPACE, FILES.keywords)),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.title), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.body), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.thumbnailTop), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.thumbnailMain), "utf-8"),
      fs.readFile(metaPath, "utf-8"),
    ]);

  const meta = JSON.parse(metaRaw) as DraftWorkspaceMeta;

  let keywords = keywordsRaw.trim();
  if (looksLikeMojibake(keywords) || keywords !== meta.keywords?.trim()) {
    if (meta.keywords && !looksLikeMojibake(meta.keywords)) {
      keywords = meta.keywords.trim();
    } else {
      try {
        keywords = await readKeywordsFromFile("blog-keywords.txt");
      } catch {
        // keep workspace value
      }
    }
    if (keywords && !looksLikeMojibake(keywords)) {
      await fs.writeFile(
        path.join(CURRENT_WORKSPACE, FILES.keywords),
        `${keywords}\n`,
        "utf-8",
      );
    }
  }

  let thumbnailPath = meta.thumbnailPath;
  try {
    thumbnailPath = (
      await fs.readFile(
        path.join(CURRENT_WORKSPACE, FILES.thumbnailPath),
        "utf-8",
      )
    ).trim();
  } catch {
    // thumbnail-path.txt 없으면 meta 값 사용
  }

  let subThumbnailPaths = meta.subThumbnailPaths;
  try {
    const raw = await fs.readFile(
      path.join(CURRENT_WORKSPACE, FILES.subThumbnailPaths),
      "utf-8",
    );
    subThumbnailPaths = JSON.parse(raw) as string[];
  } catch {
    // sub-thumbnail-paths.json 없으면 meta 값 사용
  }

  const draft: ArticleDraft = {
    topicId: meta.topicId,
    sourceTopic: {
      sourceUrl: `gems://manual/${encodeURIComponent(keywords.trim())}`,
      title: keywords.trim(),
      summary: keywords.trim(),
      sourceFeed: "gems-manual",
    },
    title: title.trim(),
    htmlBody: htmlBody.trim(),
    thumbnailText: normalizeThumbnailLineBreaks(thumbnailMain.trim()),
    thumbnailTopLabel: thumbnailTop.trim() || undefined,
    createdAt: meta.createdAt,
  };

  return {
    keywords: keywords.trim(),
    draft,
    thumbnailPath: thumbnailPath?.trim() || undefined,
    subThumbnailPaths,
  };
}

export async function saveThumbnailPath(thumbnailPath: string): Promise<void> {
  await fs.writeFile(
    path.join(CURRENT_WORKSPACE, FILES.thumbnailPath),
    `${thumbnailPath}\n`,
    "utf-8",
  );

  const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
  try {
    const meta = JSON.parse(
      await fs.readFile(metaPath, "utf-8"),
    ) as DraftWorkspaceMeta;
    meta.thumbnailPath = thumbnailPath;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // meta 없으면 thumbnail-path.txt 만 저장
  }
}

export async function saveSubThumbnailPaths(paths: string[]): Promise<void> {
  const jsonPath = path.join(CURRENT_WORKSPACE, FILES.subThumbnailPaths);
  await fs.writeFile(jsonPath, JSON.stringify(paths, null, 2), "utf-8");

  const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
  try {
    const meta = JSON.parse(
      await fs.readFile(metaPath, "utf-8"),
    ) as DraftWorkspaceMeta;
    meta.subThumbnailPaths = paths;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // meta 없으면 json 파일만 저장
  }
}

/** 브라우저 미리보기용 HTML 생성 */
export async function writePreviewHtml(): Promise<string> {
  const titlePath = path.join(CURRENT_WORKSPACE, FILES.title);
  const bodyPath = path.join(CURRENT_WORKSPACE, FILES.body);

  let title = "(제목 없음)";
  let body = "<p>본문이 없습니다.</p>";

  try {
    title = (await fs.readFile(titlePath, "utf-8")).trim();
    body = await fs.readFile(bodyPath, "utf-8");
  } catch {
    // export 직전 호출 시 파일이 아직 없을 수 있음
  }

  const previewPath = path.join(CURRENT_WORKSPACE, FILES.preview);
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} — 미리보기</title>
  <style>
    body { font-family: "Malgun Gothic", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #222; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #1a3a6b; padding-bottom: .5rem; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;

  await fs.writeFile(previewPath, html, "utf-8");
  return previewPath;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Windows: 메모장으로 편집 파일 열기 (브라우저 미리보기는 열지 않음) */
export async function openDraftEditors(): Promise<void> {
  await writePreviewHtml();

  const notepadTargets = [
    path.join(CURRENT_WORKSPACE, FILES.title),
    path.join(CURRENT_WORKSPACE, FILES.body),
    path.join(CURRENT_WORKSPACE, FILES.thumbnailTop),
    path.join(CURRENT_WORKSPACE, FILES.thumbnailMain),
  ];

  for (const filePath of notepadTargets) {
    await fs.access(filePath);
    await openInEditor(filePath);
  }
}

/** 편집용 — Windows에서는 cmd start + notepad (경로·html 확장자 안정 처리) */
function openInEditor(filePath: string): Promise<void> {
  if (platform() === "win32") {
    return openInNotepad(filePath);
  }
  return openFile(filePath);
}

function openInNotepad(filePath: string): Promise<void> {
  const winPath = path.normalize(filePath);

  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/c", "start", "", "notepad.exe", winPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", reject);
    child.unref();
    setTimeout(resolve, 500);
  });
}

/** 기본 앱으로 파일 열기 (썸네일 미리보기 등) */
export function openPathInViewer(filePath: string): Promise<void> {
  return openFile(filePath);
}

function openFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const os = platform();
    let child;

    if (os === "win32") {
      child = spawn("cmd", ["/c", "start", "", filePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (os === "darwin") {
      child = spawn("open", [filePath], { detached: true, stdio: "ignore" });
    } else {
      child = spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" });
    }

    child.on("error", reject);
    child.unref();
    setTimeout(resolve, 200);
  });
}

export function getWorkspaceDir(): string {
  return CURRENT_WORKSPACE;
}

/** 워크스페이스 썸네일 문구 파일 갱신 */
export async function updateWorkspaceThumbnailTexts(
  topLabel: string,
  mainText: string,
  keywords?: string,
  title?: string,
): Promise<void> {
  await fs.mkdir(CURRENT_WORKSPACE, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailTop),
      topLabel,
      "utf-8",
    ),
    fs.writeFile(
      path.join(CURRENT_WORKSPACE, FILES.thumbnailMain),
      mainText,
      "utf-8",
    ),
  ]);

  const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
  try {
    const meta = JSON.parse(
      await fs.readFile(metaPath, "utf-8"),
    ) as DraftWorkspaceMeta;
    if (keywords) meta.keywords = keywords;
    if (title) meta.savedTitle = title;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // meta 없으면 썸네일 텍스트 파일만 갱신
  }
}

export async function readWorkspaceMeta(): Promise<DraftWorkspaceMeta | null> {
  try {
    const raw = await fs.readFile(
      path.join(CURRENT_WORKSPACE, FILES.meta),
      "utf-8",
    );
    return JSON.parse(raw) as DraftWorkspaceMeta;
  } catch {
    return null;
  }
}

/**
 * body.html 에 블로그 스타일(폰트·구분선·정렬) 적용 후 저장.
 * 외부 붙여넣기·편집 후 썸네일·업로드 직전에 호출합니다.
 */
export async function applyStyledBodyToWorkspace(): Promise<string> {
  const bodyPath = path.join(CURRENT_WORKSPACE, FILES.body);
  const [raw, title, keywords] = await Promise.all([
    fs.readFile(bodyPath, "utf-8"),
    fs.readFile(path.join(CURRENT_WORKSPACE, FILES.title), "utf-8").catch(() => ""),
    fs.readFile(path.join(CURRENT_WORKSPACE, FILES.keywords), "utf-8").catch(() => ""),
  ]);

  const trimmed = raw.trim();

  if (
    !trimmed ||
    trimmed === IMPORT_BODY_PLACEHOLDER.trim() ||
    trimmed.includes("여기에 본문을 붙여넣으세요")
  ) {
    return trimmed;
  }

  const styled = applyBlogStyle(trimmed, {
    title: title.trim(),
    keywords: keywords.trim(),
  });
  await fs.writeFile(bodyPath, styled, "utf-8");
  await writePreviewHtml();
  return styled;
}
