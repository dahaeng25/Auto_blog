import { getDb } from "../db/client.js";
import type { DbExecutor } from "../db/types.js";
import { requireUserId } from "../auth/user-context.js";
import type { Platform } from "../../config/platforms.js";

export type ConnectJobStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "failed";

export interface ConnectJobRecord {
  platform: Platform;
  status: ConnectJobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

const DEFAULT: Omit<ConnectJobRecord, "platform"> = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  lastError: null,
};

/** maxDuration(300s) + 여유 — 서버리스 강제 종료 시 connecting 고착 방지 */
const STALE_CONNECTING_MS = Number(
  process.env.CONNECT_JOB_STALE_MS ?? String(6 * 60 * 1000),
);

function mapRow(
  platform: Platform,
  row: Record<string, unknown> | undefined,
): ConnectJobRecord {
  if (!row) return { platform, ...DEFAULT };
  return {
    platform,
    status: (row.status as ConnectJobStatus) ?? "idle",
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

function isStaleConnecting(job: ConnectJobRecord): boolean {
  if (job.status !== "connecting" || !job.startedAt) return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > STALE_CONNECTING_MS;
}

async function readJob(
  db: DbExecutor,
  userId: number,
  platform: Platform,
): Promise<ConnectJobRecord> {
  const result = await db.execute(
    `SELECT status, started_at, finished_at, last_error
     FROM platform_connect_jobs
     WHERE user_id = ? AND platform = ?`,
    [userId, platform],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return mapRow(platform, row);
}

async function writeJob(
  userId: number,
  platform: Platform,
  partial: Partial<Omit<ConnectJobRecord, "platform">>,
): Promise<ConnectJobRecord> {
  const db = await getDb();
  const current = await readJob(db, userId, platform);
  const next = { ...current, ...partial };

  await db.execute(
    `INSERT INTO platform_connect_jobs (
      user_id, platform, status, started_at, finished_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, platform) DO UPDATE SET
      status = excluded.status,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      last_error = excluded.last_error`,
    [
      userId,
      platform,
      next.status,
      next.startedAt,
      next.finishedAt,
      next.lastError,
    ],
  );
  return next;
}

async function settleStale(
  userId: number,
  job: ConnectJobRecord,
): Promise<ConnectJobRecord> {
  if (!isStaleConnecting(job)) return job;
  const staleMsg =
    "연결이 시간 초과로 중단된 것 같습니다. 잠시 후 다시 연결해 주세요.";
  return writeJob(userId, job.platform, {
    status: "failed",
    finishedAt: new Date().toISOString(),
    lastError: staleMsg,
  });
}

export const connectJobStore = {
  async get(platform: Platform): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    const db = await getDb();
    const job = await readJob(db, userId, platform);
    return settleStale(userId, job);
  },

  async getMany(
    platforms: Platform[],
  ): Promise<Record<string, ConnectJobRecord>> {
    const userId = requireUserId();
    const db = await getDb();
    const out: Record<string, ConnectJobRecord> = {};
    for (const platform of platforms) {
      const job = await readJob(db, userId, platform);
      out[platform] = await settleStale(userId, job);
    }
    return out;
  },

  async markConnecting(platform: Platform): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    return writeJob(userId, platform, {
      status: "connecting",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null,
    });
  },

  async markConnected(platform: Platform): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    return writeJob(userId, platform, {
      status: "connected",
      finishedAt: new Date().toISOString(),
      lastError: null,
    });
  },

  async markFailed(
    platform: Platform,
    error: string,
  ): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    return writeJob(userId, platform, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      lastError: error,
    });
  },
};
