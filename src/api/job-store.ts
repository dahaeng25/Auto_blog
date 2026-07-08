import { getDb } from "../db/client.js";
import type { DbExecutor } from "../db/types.js";

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

async function readState(db: DbExecutor): Promise<JobRecord> {
  const result = await db.execute("SELECT * FROM job_state WHERE id = 1");
  if (result.rows.length === 0) return { ...DEFAULT_STATE };
  return {
    ...DEFAULT_STATE,
    ...mapRow(result.rows[0] as Record<string, unknown>),
  };
}

async function writeState(
  partial: Partial<JobRecord & { trigger: string | null }>,
): Promise<void> {
  const db = await getDb();
  const current = await readState(db);
  const next = { ...current, ...partial };

  await db.execute(
    `UPDATE job_state SET
      status = ?, trigger_source = ?, started_at = ?, finished_at = ?,
      last_error = ?, last_title = ?, last_thumbnail_path = ?
     WHERE id = 1`,
    [
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

export const jobStore = {
  async get(): Promise<JobRecord> {
    const db = await getDb();
    return readState(db);
  },

  async isRunning(): Promise<boolean> {
    const state = await this.get();
    return state.status === "running";
  },

  async markRunning(trigger: string): Promise<void> {
    const prev = await this.get();
    await writeState({
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
    const prev = await this.get();
    await writeState({
      ...prev,
      status: "success",
      finishedAt: new Date().toISOString(),
      lastError: null,
      lastTitle: title,
      lastThumbnailPath: thumbnailPath ?? null,
    });
  },

  async markError(error: string): Promise<void> {
    const prev = await this.get();
    await writeState({
      ...prev,
      status: "error",
      finishedAt: new Date().toISOString(),
      lastError: error,
    });
  },

  async updateArtifacts(
    partial: Partial<Pick<JobRecord, "lastTitle" | "lastThumbnailPath">>,
  ): Promise<void> {
    const prev = await this.get();
    await writeState({ ...prev, ...partial });
  },
};
