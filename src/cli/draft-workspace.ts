import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { config } from "../../config/index.js";
import { normalizeTopicInput } from "./resolve-blog-topic.js";
import type { ArticleDraft } from "../content/types.js";
import { normalizeThumbnailLineBreaks } from "../thumbnail/normalize-thumbnail-line-breaks.js";

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
} as const;

export interface DraftWorkspaceMeta {
  topicId: number;
  createdAt: string;
  keywords?: string;
  thumbnailPath?: string;
}

export interface LoadedWorkspace {
  keywords: string;
  draft: ArticleDraft;
  thumbnailPath?: string;
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
    content = await fs.readFile(abs, "utf-8");
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
): Promise<string> {
  await fs.mkdir(CURRENT_WORKSPACE, { recursive: true });

  const meta: DraftWorkspaceMeta = {
    topicId: draft.topicId,
    createdAt: draft.createdAt,
    keywords,
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

/** 편집 폴더에서 원고 읽기 */
export async function loadDraftFromWorkspace(): Promise<LoadedWorkspace> {
  const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
  try {
    await fs.access(metaPath);
  } catch {
    throw new Error(
      "편집용 원고가 없습니다. 먼저 [2] 글 작성을 실행하세요.",
    );
  }

  const [keywords, title, htmlBody, thumbnailTop, thumbnailMain, metaRaw] =
    await Promise.all([
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.keywords), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.title), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.body), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.thumbnailTop), "utf-8"),
      fs.readFile(path.join(CURRENT_WORKSPACE, FILES.thumbnailMain), "utf-8"),
      fs.readFile(metaPath, "utf-8"),
    ]);

  const meta = JSON.parse(metaRaw) as DraftWorkspaceMeta;

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

/** Windows: 메모장으로 편집 파일 열기 */
export async function openDraftEditors(): Promise<void> {
  const targets = [
    path.join(CURRENT_WORKSPACE, FILES.title),
    path.join(CURRENT_WORKSPACE, FILES.body),
    path.join(CURRENT_WORKSPACE, FILES.thumbnailTop),
    path.join(CURRENT_WORKSPACE, FILES.thumbnailMain),
  ];

  for (const filePath of targets) {
    await openFile(filePath);
  }

  const preview = await writePreviewHtml();
  await openFile(preview);
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

  if (keywords) {
    const metaPath = path.join(CURRENT_WORKSPACE, FILES.meta);
    try {
      const meta = JSON.parse(
        await fs.readFile(metaPath, "utf-8"),
      ) as DraftWorkspaceMeta;
      meta.keywords = keywords;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch {
      // meta 없으면 썸네일 텍스트 파일만 갱신
    }
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
