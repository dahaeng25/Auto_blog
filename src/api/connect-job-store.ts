import { getDb } from "../db/client.js";
import type { DbExecutor } from "../db/types.js";
import { requireUserId } from "../auth/user-context.js";
import type { Platform } from "../../config/platforms.js";

export type ConnectJobStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "failed";

export type ConnectJobMode = "auto" | "manual";

export interface ConnectStepLog {
  at: string;
  message: string;
}

export interface ConnectJobRecord {
  platform: Platform;
  status: ConnectJobStatus;
  mode: ConnectJobMode;
  currentStep: string | null;
  stepLogs: ConnectStepLog[];
  screenshotBase64: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

const DEFAULT: Omit<ConnectJobRecord, "platform"> = {
  status: "idle",
  mode: "auto",
  currentStep: null,
  stepLogs: [],
  screenshotBase64: null,
  startedAt: null,
  finishedAt: null,
  lastError: null,
};

const MAX_STEP_LOGS = 40;

/** maxDuration(300s) + 여유 — 서버리스 강제 종료 시 connecting 고착 방지 */
const STALE_CONNECTING_MS = Number(
  process.env.CONNECT_JOB_STALE_MS ?? String(6 * 60 * 1000),
);

let schemaReady = false;

function parseStepLogs(raw: unknown): ConnectStepLog[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ConnectStepLog =>
          Boolean(e) &&
          typeof e === "object" &&
          typeof (e as ConnectStepLog).message === "string",
      )
      .map((e) => ({
        at: typeof e.at === "string" ? e.at : new Date().toISOString(),
        message: e.message,
      }));
  } catch {
    return [];
  }
}

function mapRow(
  platform: Platform,
  row: Record<string, unknown> | undefined,
): ConnectJobRecord {
  if (!row) return { platform, ...DEFAULT };
  const mode = row.mode === "manual" ? "manual" : "auto";
  return {
    platform,
    status: (row.status as ConnectJobStatus) ?? "idle",
    mode,
    currentStep: row.current_step ? String(row.current_step) : null,
    stepLogs: parseStepLogs(row.step_logs_json),
    screenshotBase64: row.screenshot_base64
      ? String(row.screenshot_base64)
      : null,
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

async function ensureConnectJobSchema(db: DbExecutor): Promise<void> {
  if (schemaReady) return;
  const alters = [
    "ALTER TABLE platform_connect_jobs ADD COLUMN current_step TEXT",
    "ALTER TABLE platform_connect_jobs ADD COLUMN step_logs_json TEXT",
    "ALTER TABLE platform_connect_jobs ADD COLUMN screenshot_base64 TEXT",
    "ALTER TABLE platform_connect_jobs ADD COLUMN mode TEXT DEFAULT 'auto'",
  ];
  for (const sql of alters) {
    try {
      await db.execute(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column/i.test(message)) throw error;
    }
  }
  schemaReady = true;
}

async function readJob(
  db: DbExecutor,
  userId: number,
  platform: Platform,
): Promise<ConnectJobRecord> {
  await ensureConnectJobSchema(db);
  const result = await db.execute(
    `SELECT status, mode, current_step, step_logs_json, screenshot_base64,
            started_at, finished_at, last_error
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
  await ensureConnectJobSchema(db);
  const current = await readJob(db, userId, platform);
  const next = { ...current, ...partial };

  await db.execute(
    `INSERT INTO platform_connect_jobs (
      user_id, platform, status, mode, current_step, step_logs_json,
      screenshot_base64, started_at, finished_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, platform) DO UPDATE SET
      status = excluded.status,
      mode = excluded.mode,
      current_step = excluded.current_step,
      step_logs_json = excluded.step_logs_json,
      screenshot_base64 = excluded.screenshot_base64,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      last_error = excluded.last_error`,
    [
      userId,
      platform,
      next.status,
      next.mode,
      next.currentStep,
      next.stepLogs.length > 0 ? JSON.stringify(next.stepLogs) : null,
      next.screenshotBase64,
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
    currentStep: staleMsg,
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

  async markConnecting(
    platform: Platform,
    mode: ConnectJobMode = "auto",
  ): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    const firstStep =
      mode === "manual"
        ? "직접 로그인 준비 중…"
        : "연결을 시작하는 중…";
    return writeJob(userId, platform, {
      status: "connecting",
      mode,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null,
      currentStep: firstStep,
      stepLogs: [{ at: new Date().toISOString(), message: firstStep }],
      screenshotBase64: null,
    });
  },

  async appendStep(
    platform: Platform,
    message: string,
    screenshot?: Buffer,
  ): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    const db = await getDb();
    const current = await readJob(db, userId, platform);
    const at = new Date().toISOString();
    const last = current.stepLogs[current.stepLogs.length - 1];
    const stepLogs =
      last?.message === message
        ? current.stepLogs
        : [...current.stepLogs, { at, message }].slice(-MAX_STEP_LOGS);

    return writeJob(userId, platform, {
      currentStep: message,
      stepLogs,
      screenshotBase64: screenshot
        ? screenshot.toString("base64")
        : current.screenshotBase64,
    });
  },

  async markConnected(platform: Platform): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    const done = "연결 완료";
    const db = await getDb();
    const current = await readJob(db, userId, platform);
    return writeJob(userId, platform, {
      status: "connected",
      finishedAt: new Date().toISOString(),
      lastError: null,
      currentStep: done,
      stepLogs: [...current.stepLogs, { at: new Date().toISOString(), message: done }].slice(
        -MAX_STEP_LOGS,
      ),
    });
  },

  async markFailed(
    platform: Platform,
    error: string,
  ): Promise<ConnectJobRecord> {
    const userId = requireUserId();
    const db = await getDb();
    const current = await readJob(db, userId, platform);
    return writeJob(userId, platform, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      lastError: error,
      currentStep: error,
      stepLogs: [...current.stepLogs, { at: new Date().toISOString(), message: error }].slice(
        -MAX_STEP_LOGS,
      ),
    });
  },
};
