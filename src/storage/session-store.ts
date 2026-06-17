import { getDb } from "../db/client.js";
import { config } from "../../config/index.js";
import { PLATFORMS, type Platform } from "../../config/platforms.js";

async function writeTempState(platform: Platform, json: string): Promise<string> {
  const { default: fs } = await import("node:fs/promises");
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");
  const tmpPath = path.join(
    os.tmpdir(),
    `blog-orchestrator-${platform}-state.json`,
  );
  await fs.writeFile(tmpPath, json, "utf-8");
  return tmpPath;
}

export async function hasStoredSession(platform: Platform): Promise<boolean> {
  if (!config.isVercel) {
    const { default: fs } = await import("node:fs/promises");
    try {
      await fs.access(PLATFORMS[platform].stateFile);
      return true;
    } catch {
      return false;
    }
  }

  const db = await getDb();
  const result = await db.execute(
    "SELECT 1 FROM platform_sessions WHERE platform = ?",
    [platform],
  );
  return result.rows.length > 0;
}

export async function resolveSessionPath(platform: Platform): Promise<string> {
  if (!config.isVercel) {
    const statePath = PLATFORMS[platform].stateFile;
    if (!(await hasStoredSession(platform))) {
      throw new Error(
        `[${PLATFORMS[platform].name}] 세션 파일이 없습니다: ${statePath}\n` +
          `먼저 'npm run auth:setup'을 실행하거나 대시보드에서 세션을 업로드하세요.`,
      );
    }
    return statePath;
  }

  const db = await getDb();
  const result = await db.execute(
    "SELECT state_json FROM platform_sessions WHERE platform = ?",
    [platform],
  );

  if (result.rows.length === 0) {
    throw new Error(
      `[${PLATFORMS[platform].name}] 세션이 없습니다. 대시보드에서 세션 JSON을 업로드하세요.`,
    );
  }

  return writeTempState(platform, String(result.rows[0].state_json));
}

export async function saveStoredSession(
  platform: Platform,
  stateJson: string,
): Promise<void> {
  if (!config.isVercel) {
    const { default: fs } = await import("node:fs/promises");
    const { default: path } = await import("node:path");
    const statePath = PLATFORMS[platform].stateFile;
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, stateJson, "utf-8");
    return;
  }

  const db = await getDb();
  await db.execute(
    `INSERT INTO platform_sessions (platform, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(platform) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`,
    [platform, stateJson, new Date().toISOString()],
  );
}
