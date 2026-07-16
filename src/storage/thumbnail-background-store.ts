import path from "node:path";
import { getDb } from "../db/client.js";
import { config } from "../../config/index.js";
import {
  getCurrentUserId,
  requireUserId,
} from "../auth/user-context.js";
import {
  findSampleBackground,
  THUMBNAIL_SAMPLE_BACKGROUNDS,
  type ThumbnailSampleBackground,
} from "../thumbnail/sample-backgrounds.js";

export type ThumbnailBackgroundSource = "upload" | "sample";

export interface ThumbnailBackgroundRow {
  source: ThumbnailBackgroundSource;
  sampleId: string | null;
  imageBase64: string | null;
  mimeType: string | null;
  updatedAt: string;
}

export interface ThumbnailBackgroundStatus {
  source: ThumbnailBackgroundSource | "default";
  sampleId: string | null;
  sampleName: string | null;
  mimeType: string | null;
  hasImage: boolean;
  updatedAt: string | null;
  message: string;
}

export type ResolvedThumbnailBackground =
  | { kind: "image"; absolutePath: string }
  | { kind: "gradient"; gradient: string };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

function localBgPath(userId: number): string {
  return path.join(config.authDir, `user_${userId}`, "thumbnail-bg.png");
}

async function writeLocalMirror(
  userId: number,
  buffer: Buffer,
): Promise<void> {
  if (config.isVercel) return;
  const { default: fs } = await import("node:fs/promises");
  const dest = localBgPath(userId);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
}

async function removeLocalMirror(userId: number): Promise<void> {
  if (config.isVercel) return;
  const { default: fs } = await import("node:fs/promises");
  try {
    await fs.unlink(localBgPath(userId));
  } catch {
    /* ignore */
  }
}

export function listSampleBackgrounds(): readonly ThumbnailSampleBackground[] {
  return THUMBNAIL_SAMPLE_BACKGROUNDS;
}

export async function getThumbnailBackgroundRow(): Promise<ThumbnailBackgroundRow | null> {
  const userId = requireUserId();
  const db = await getDb();
  const result = await db.execute(
    `SELECT source, sample_id, image_base64, mime_type, updated_at
     FROM user_thumbnail_backgrounds WHERE user_id = ?`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0]!;
  const source = String(row.source);
  if (source !== "upload" && source !== "sample") return null;
  return {
    source,
    sampleId: row.sample_id != null ? String(row.sample_id) : null,
    imageBase64: row.image_base64 != null ? String(row.image_base64) : null,
    mimeType: row.mime_type != null ? String(row.mime_type) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function getThumbnailBackgroundStatus(): Promise<ThumbnailBackgroundStatus> {
  const row = await getThumbnailBackgroundRow();
  if (!row) {
    return {
      source: "default",
      sampleId: null,
      sampleName: null,
      mimeType: null,
      hasImage: false,
      updatedAt: null,
      message:
        "배경이 설정되지 않았습니다. 이미지를 업로드하거나 샘플을 선택하세요.",
    };
  }

  if (row.source === "sample" && row.sampleId) {
    const sample = findSampleBackground(row.sampleId);
    return {
      source: "sample",
      sampleId: row.sampleId,
      sampleName: sample?.name ?? row.sampleId,
      mimeType: null,
      hasImage: false,
      updatedAt: row.updatedAt,
      message: sample
        ? `샘플 「${sample.name}」을(를) 사용합니다.`
        : "선택한 샘플을 찾을 수 없어 기본 배경으로 대체될 수 있습니다.",
    };
  }

  if (row.source === "upload" && row.imageBase64) {
    return {
      source: "upload",
      sampleId: null,
      sampleName: null,
      mimeType: row.mimeType,
      hasImage: true,
      updatedAt: row.updatedAt,
      message: "업로드한 배경 이미지를 사용합니다.",
    };
  }

  return {
    source: "default",
    sampleId: null,
    sampleName: null,
    mimeType: null,
    hasImage: false,
    updatedAt: row.updatedAt,
    message: "배경 설정이 비어 있습니다. 다시 선택하거나 업로드하세요.",
  };
}

export async function saveUploadedThumbnailBackground(
  imageBase64: string,
  mimeType: string,
): Promise<ThumbnailBackgroundStatus> {
  const userId = requireUserId();
  const normalizedMime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (!ALLOWED_MIME.has(normalizedMime)) {
    throw new Error(
      "PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.",
    );
  }

  const raw = imageBase64.includes(",")
    ? imageBase64.split(",").pop()!
    : imageBase64;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new Error("이미지 데이터를 읽을 수 없습니다.");
  }
  if (buffer.length === 0) {
    throw new Error("빈 이미지입니다.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("이미지 크기는 2MB 이하여야 합니다.");
  }

  const storedMime =
    normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime;
  const updatedAt = new Date().toISOString();
  const db = await getDb();
  await db.execute(
    `INSERT INTO user_thumbnail_backgrounds
       (user_id, source, sample_id, image_base64, mime_type, updated_at)
     VALUES (?, 'upload', NULL, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       source = 'upload',
       sample_id = NULL,
       image_base64 = excluded.image_base64,
       mime_type = excluded.mime_type,
       updated_at = excluded.updated_at`,
    [userId, raw, storedMime, updatedAt],
  );
  await writeLocalMirror(userId, buffer);
  return getThumbnailBackgroundStatus();
}

export async function saveSampleThumbnailBackground(
  sampleId: string,
): Promise<ThumbnailBackgroundStatus> {
  const userId = requireUserId();
  const sample = findSampleBackground(sampleId);
  if (!sample) {
    throw new Error("알 수 없는 샘플 배경입니다.");
  }

  const updatedAt = new Date().toISOString();
  const db = await getDb();
  await db.execute(
    `INSERT INTO user_thumbnail_backgrounds
       (user_id, source, sample_id, image_base64, mime_type, updated_at)
     VALUES (?, 'sample', ?, NULL, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       source = 'sample',
       sample_id = excluded.sample_id,
       image_base64 = NULL,
       mime_type = NULL,
       updated_at = excluded.updated_at`,
    [userId, sample.id, updatedAt],
  );
  await removeLocalMirror(userId);
  return getThumbnailBackgroundStatus();
}

export async function clearThumbnailBackground(): Promise<ThumbnailBackgroundStatus> {
  const userId = requireUserId();
  const db = await getDb();
  await db.execute(
    "DELETE FROM user_thumbnail_backgrounds WHERE user_id = ?",
    [userId],
  );
  await removeLocalMirror(userId);
  return getThumbnailBackgroundStatus();
}

/**
 * 업로드 이미지를 /tmp(또는 로컬 auth)에 풀어 절대 경로를 반환.
 * 샘플은 그라데이션 문자열을 반환.
 * 로그인 컨텍스트가 없거나 설정이 없으면 null.
 */
export async function tryResolveUserThumbnailBackground(): Promise<ResolvedThumbnailBackground | null> {
  const userId = getCurrentUserId();
  if (userId == null) return null;

  const db = await getDb();
  const result = await db.execute(
    `SELECT source, sample_id, image_base64, mime_type
     FROM user_thumbnail_backgrounds WHERE user_id = ?`,
    [userId],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const source = String(row.source);

  if (source === "sample") {
    const sampleId = row.sample_id != null ? String(row.sample_id) : "";
    const sample = findSampleBackground(sampleId);
    if (!sample) return null;
    return { kind: "gradient", gradient: sample.gradient };
  }

  if (source === "upload" && row.image_base64) {
    const buffer = Buffer.from(String(row.image_base64), "base64");
    const { default: fs } = await import("node:fs/promises");
    const { default: os } = await import("node:os");
    const ext =
      String(row.mime_type ?? "").includes("jpeg") ||
      String(row.mime_type ?? "").includes("jpg")
        ? "jpg"
        : String(row.mime_type ?? "").includes("webp")
          ? "webp"
          : "png";
    const tmpPath = path.join(
      os.tmpdir(),
      `blog-orchestrator-u${userId}-thumb-bg.${ext}`,
    );
    await fs.writeFile(tmpPath, buffer);
    if (!config.isVercel) {
      await writeLocalMirror(userId, buffer);
    }
    return { kind: "image", absolutePath: tmpPath };
  }

  return null;
}

/** 업로드 이미지 바이트 (미리보기 API용) */
export async function getUploadedBackgroundBuffer(): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const row = await getThumbnailBackgroundRow();
  if (!row || row.source !== "upload" || !row.imageBase64) return null;
  return {
    buffer: Buffer.from(row.imageBase64, "base64"),
    mimeType: row.mimeType ?? "image/png",
  };
}
