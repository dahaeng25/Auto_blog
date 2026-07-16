import path from "node:path";
import { getDb } from "../db/client.js";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { requireUserId } from "../auth/user-context.js";

function localStatePath(platform: Platform, userId: number): string {
  return path.join(
    config.authDir,
    `user_${userId}`,
    path.basename(PLATFORMS[platform].stateFile),
  );
}

/** CLI 업로드용 — 기존 경로 auth/naver_state.json 등 */
function legacyStatePath(platform: Platform): string {
  return PLATFORMS[platform].stateFile;
}

async function writeTempState(
  platform: Platform,
  userId: number,
  json: string,
): Promise<string> {
  const { default: fs } = await import("node:fs/promises");
  const { default: os } = await import("node:os");
  const tmpPath = path.join(
    os.tmpdir(),
    `blog-orchestrator-u${userId}-${platform}-state.json`,
  );
  await fs.writeFile(tmpPath, json, "utf-8");
  return tmpPath;
}

async function writeLocalFiles(
  platform: Platform,
  userId: number,
  stateJson: string,
): Promise<void> {
  if (config.isVercel) return;
  const { default: fs } = await import("node:fs/promises");
  const scoped = localStatePath(platform, userId);
  await fs.mkdir(path.dirname(scoped), { recursive: true });
  await fs.writeFile(scoped, stateJson, "utf-8");
  // 대시보드 업로드용으로 레거시 경로에도 복사
  const legacy = legacyStatePath(platform);
  await fs.mkdir(path.dirname(legacy), { recursive: true });
  await fs.writeFile(legacy, stateJson, "utf-8");
}

export async function hasStoredSession(platform: Platform): Promise<boolean> {
  const userId = requireUserId();
  const db = await getDb();
  const result = await db.execute(
    "SELECT 1 FROM platform_sessions WHERE user_id = ? AND platform = ?",
    [userId, platform],
  );
  if (result.rows.length > 0) return true;

  if (config.isVercel) return false;

  const { default: fs } = await import("node:fs/promises");
  for (const p of [localStatePath(platform, userId), legacyStatePath(platform)]) {
    try {
      await fs.access(p);
      return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

/**
 * Playwright에 넘길 storageState 파일 경로.
 * DB 세션을 우선하고, 없으면 로컬 파일을 사용합니다.
 */
export async function resolveSessionPath(platform: Platform): Promise<string> {
  const userId = requireUserId();
  const db = await getDb();
  const result = await db.execute(
    "SELECT state_json FROM platform_sessions WHERE user_id = ? AND platform = ?",
    [userId, platform],
  );

  if (result.rows.length > 0) {
    return writeTempState(platform, userId, String(result.rows[0].state_json));
  }

  if (!config.isVercel) {
    const { default: fs } = await import("node:fs/promises");
    for (const statePath of [
      localStatePath(platform, userId),
      legacyStatePath(platform),
    ]) {
      try {
        await fs.access(statePath);
        return statePath;
      } catch {
        /* continue */
      }
    }
  }

  throw new Error(
    `[${PLATFORMS[platform].name}] 연결이 없습니다. 대시보드에서 「계정 연결」로 로그인해 주세요.`,
  );
}

/** 사용자별 저장된 플랫폼 세션 삭제 */
export async function deleteStoredSession(platform: Platform): Promise<void> {
  const userId = requireUserId();
  const db = await getDb();
  await db.execute(
    "DELETE FROM platform_sessions WHERE user_id = ? AND platform = ?",
    [userId, platform],
  );

  if (config.isVercel) return;
  const { default: fs } = await import("node:fs/promises");
  for (const p of [localStatePath(platform, userId), legacyStatePath(platform)]) {
    try {
      await fs.unlink(p);
    } catch {
      /* ignore missing */
    }
  }
}

/**
 * 로그인 사용자별로 Playwright storageState JSON을 DB에 저장.
 * 로컬에서는 업로드용 auth/*_state.json 파일도 함께 기록합니다.
 */
export async function saveStoredSession(
  platform: Platform,
  stateJson: string,
): Promise<void> {
  const userId = requireUserId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO platform_sessions (user_id, platform, state_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, platform) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`,
    [userId, platform, stateJson, new Date().toISOString()],
  );
  await writeLocalFiles(platform, userId, stateJson);
}
