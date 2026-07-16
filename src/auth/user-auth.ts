import { randomBytes } from "node:crypto";
import { getDb } from "../db/client.js";
import { config } from "../../config/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthUser } from "./user-context.js";

export const SESSION_COOKIE = "blog_sid";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 60 * 60;

export interface SessionUser extends AuthUser {
  expiresAt: string;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3 || u.length > 32) {
    return "사용자명은 3~32자여야 합니다.";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(u)) {
    return "사용자명은 영문, 숫자, _ . - 만 사용할 수 있습니다.";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 6) return "비밀번호는 최소 6자여야 합니다.";
  if (password.length > 128) return "비밀번호가 너무 깁니다.";
  return null;
}

export async function signupUser(
  username: string,
  password: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const nameErr = validateUsername(username);
  if (nameErr) return { error: nameErr };
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };

  const db = await getDb();
  const normalized = normalizeUsername(username);
  const existing = await db.execute(
    "SELECT id FROM users WHERE username = ?",
    [normalized],
  );
  if (existing.rows.length > 0) {
    return { error: "이미 사용 중인 사용자명입니다." };
  }

  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();
  const result = await db.execute(
    `INSERT INTO users (username, password_hash, created_at)
     VALUES (?, ?, ?)`,
    [normalized, passwordHash, createdAt],
  );

  const id = Number(result.lastInsertRowid);
  await ensureJobStateRow(id);

  return { user: { id, username: normalized } };
}

export async function loginUser(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string; expiresAt: string } | { error: string }> {
  const db = await getDb();
  const normalized = normalizeUsername(username);
  const result = await db.execute(
    "SELECT id, username, password_hash FROM users WHERE username = ?",
    [normalized],
  );
  if (result.rows.length === 0) {
    return { error: "사용자명 또는 비밀번호가 올바르지 않습니다." };
  }

  const row = result.rows[0] as Record<string, unknown>;
  const ok = await verifyPassword(password, String(row.password_hash));
  if (!ok) {
    return { error: "사용자명 또는 비밀번호가 올바르지 않습니다." };
  }

  const user: AuthUser = {
    id: Number(row.id),
    username: String(row.username),
  };
  const { token, expiresAt } = await createSession(user.id);
  await ensureJobStateRow(user.id);
  return { user, token, expiresAt };
}

async function ensureJobStateRow(userId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO job_state (user_id, status)
     VALUES (?, 'idle')
     ON CONFLICT(user_id) DO NOTHING`,
    [userId],
  );
}

export async function createSession(
  userId: number,
): Promise<{ token: string; expiresAt: string }> {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_SEC * 1000,
  ).toISOString();

  await db.execute(
    `INSERT INTO user_sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, expiresAt, new Date().toISOString()],
  );

  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.execute("DELETE FROM user_sessions WHERE token = ?", [token]);
}

export async function resolveSessionUser(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  const db = await getDb();
  const result = await db.execute(
    `SELECT s.user_id, s.expires_at, u.username
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  const expiresAt = String(row.expires_at);
  if (Date.parse(expiresAt) <= Date.now()) {
    await destroySession(token);
    return null;
  }

  return {
    id: Number(row.user_id),
    username: String(row.username),
    expiresAt,
  };
}

export function parseCookieHeader(
  cookieHeader: string | string[] | undefined,
): Record<string, string> {
  const raw = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : (cookieHeader ?? "");
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionTokenFromRequest(headers: {
  cookie?: string | string[];
}): string | undefined {
  return parseCookieHeader(headers.cookie)[SESSION_COOKIE];
}

export function buildSessionCookie(
  token: string,
  maxAgeSec = SESSION_MAX_AGE_SEC,
): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (config.isVercel || process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (config.isVercel || process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Cron 등 비로그인 실행용 — AUTH_CRON_USER_ID 또는 첫 사용자 */
export async function resolveCronUser(): Promise<AuthUser | null> {
  const envId = Number(process.env.AUTH_CRON_USER_ID ?? "");
  const db = await getDb();

  if (Number.isFinite(envId) && envId > 0) {
    const result = await db.execute(
      "SELECT id, username FROM users WHERE id = ?",
      [envId],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      return { id: Number(row.id), username: String(row.username) };
    }
  }

  const first = await db.execute(
    "SELECT id, username FROM users ORDER BY id ASC LIMIT 1",
  );
  if (first.rows.length === 0) return null;
  const row = first.rows[0] as Record<string, unknown>;
  return { id: Number(row.id), username: String(row.username) };
}
