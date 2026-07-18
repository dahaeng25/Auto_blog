import { getDb } from "../db/client.js";
import { requireUserId } from "../auth/user-context.js";
import type { Platform } from "../../config/platforms.js";

export type ConnectInputAction =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "press"; key: "Enter" | "Tab" | "Backspace" | "Escape" };

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const db = await getDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS platform_connect_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      action_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_platform_connect_inputs_job
     ON platform_connect_inputs(user_id, platform, id)`,
  );
  schemaReady = true;
}

export const connectInputStore = {
  async enqueue(
    platform: Platform,
    action: ConnectInputAction,
  ): Promise<void> {
    await ensureSchema();
    const db = await getDb();
    const userId = requireUserId();
    await db.execute(
      `INSERT INTO platform_connect_inputs
       (user_id, platform, action_json, created_at)
       VALUES (?, ?, ?, ?)`,
      [userId, platform, JSON.stringify(action), new Date().toISOString()],
    );
  },

  async drain(platform: Platform): Promise<ConnectInputAction[]> {
    await ensureSchema();
    const db = await getDb();
    const userId = requireUserId();
    const result = await db.execute(
      `SELECT id, action_json
       FROM platform_connect_inputs
       WHERE user_id = ? AND platform = ?
       ORDER BY id ASC
       LIMIT 20`,
      [userId, platform],
    );
    if (result.rows.length === 0) return [];

    const ids = result.rows.map((row) => Number(row.id));
    await db.execute(
      `DELETE FROM platform_connect_inputs
       WHERE user_id = ? AND platform = ?
         AND id IN (${ids.map(() => "?").join(", ")})`,
      [userId, platform, ...ids],
    );

    return result.rows.flatMap((row) => {
      try {
        return [JSON.parse(String(row.action_json)) as ConnectInputAction];
      } catch {
        return [];
      }
    });
  },

  async clear(platform: Platform): Promise<void> {
    await ensureSchema();
    const db = await getDb();
    await db.execute(
      `DELETE FROM platform_connect_inputs
       WHERE user_id = ? AND platform = ?`,
      [requireUserId(), platform],
    );
  },
};
