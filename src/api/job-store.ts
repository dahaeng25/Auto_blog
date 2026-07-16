import { getDb } from "../db/client.js";
import type { DbExecutor } from "../db/types.js";
import { requireUserId } from "../auth/user-context.js";

export type JobStatus = "idle" | "running" | "success" | "error";

export interface JobRecord {
  status: JobStatus;
  trigger: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  lastTitle: string | null;
  lastThumbnailPath: string | null;
}

const DEFAULT_STATE: JobRecord = {
  status: "idle",
  trigger: null,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  lastTitle: null,
  lastThumbnailPath: null,
};

/**
 * Vercel 서버리스는 함수 타임아웃/강제 종료 시 markError가 호출되지 않아
 * job_state 가 running 으로 남을 수 있다. maxDuration(300s) + 여유.
 */
const STALE_RUNNING_MS = Number(
  process.env.JOB_STALE_RUNNING_MS ?? String(8 * 60 * 1000),
);

function mapRow(row: Record<string, unknown>): JobRecord {
  return {
    status: (row.status as JobStatus) ?? "idle",
    trigger: row.trigger_source ? String(row.trigger_source) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    lastTitle: row.last_title ? String(row.last_title) : null,
    lastThumbnailPath: row.last_thumbnail_path
      ? String(row.last_thumbnail_path)
      : null,
  };
}

async function readState(db: DbExecutor, userId: number): Promise<JobRecord> {
  const result = await db.execute(
    "SELECT * FROM job_state WHERE user_id = ?",
    [userId],
  );
  if (result.rows.length === 0) return { ...DEFAULT_STATE };
  return {
    ...DEFAULT_STATE,
    ...mapRow(result.rows[0] as Record<string, unknown>),
  };
}

async function writeState(
  userId: number,
  partial: Partial<JobRecord & { trigger: string | null }>,
): Promise<void> {
  const db = await getDb();
  const current = await readState(db, userId);
  const next = { ...current, ...partial };

  await db.execute(
    `INSERT INTO job_state (
      user_id, status, trigger_source, started_at, finished_at,
      last_error, last_title, last_thumbnail_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status,
      trigger_source = excluded.trigger_source,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      last_error = excluded.last_error,
      last_title = excluded.last_title,
      last_thumbnail_path = excluded.last_thumbnail_path`,
    [
      userId,
      next.status,
      next.trigger,
      next.startedAt,
      next.finishedAt,
      next.lastError,
      next.lastTitle,
      next.lastThumbnailPath,
    ],
  );
}

function isStaleRunning(job: JobRecord): boolean {
  if (job.status !== "running" || !job.startedAt) return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > STALE_RUNNING_MS;
}

export const jobStore = {
  async get(): Promise<JobRecord> {
    const userId = requireUserId();
    const db = await getDb();
    const job = await readState(db, userId);
    if (!isStaleRunning(job)) return job;

    const staleMsg =
      "실행이 중단된 것으로 보입니다 (서버리스 타임아웃 또는 프로세스 종료). 다시 실행해 주세요.";
    await writeState(userId, {
      ...job,
      status: "error",
      finishedAt: new Date().toISOString(),
      lastError: staleMsg,
    });
    return {
      ...job,
      status: "error",
      finishedAt: new Date().toISOString(),
      lastError: staleMsg,
    };
  },

  async isRunning(): Promise<boolean> {
    const state = await this.get();
    return state.status === "running";
  },

  async markRunning(trigger: string): Promise<void> {
    const userId = requireUserId();
    const prev = await this.get();
    await writeState(userId, {
      status: "running",
      trigger,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null,
      lastTitle: prev.lastTitle,
      lastThumbnailPath: prev.lastThumbnailPath,
    });
  },

  async markSuccess(title: string, thumbnailPath?: string): Promise<void> {
    const userId = requireUserId();
    const prev = await this.get();
    await writeState(userId, {
      ...prev,
      status: "success",
      finishedAt: new Date().toISOString(),
      lastError: null,
      lastTitle: title,
      lastThumbnailPath: thumbnailPath ?? null,
    });
  },

  async markError(error: string): Promise<void> {
    const userId = requireUserId();
    const prev = await this.get();
    await writeState(userId, {
      ...prev,
      status: "error",
      finishedAt: new Date().toISOString(),
      lastError: error,
    });
  },

  async updateArtifacts(
    partial: Partial<Pick<JobRecord, "lastTitle" | "lastThumbnailPath">>,
  ): Promise<void> {
    const userId = requireUserId();
    const prev = await this.get();
    await writeState(userId, { ...prev, ...partial });
  },
};
