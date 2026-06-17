import { getDb } from "./client.js";
import { loadSchemaStatements } from "./schema-loader.js";

/** 스키마에 누락될 수 있는 보조 테이블 (구 Turso DB 호환) */
const SUPPLEMENTAL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS platform_sessions (
    platform    TEXT PRIMARY KEY,
    state_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
];

/**
 * DB 스키마를 보장합니다. Vercel/Turso 첫 요청 전에 호출하세요.
 */
export async function ensureSchema(): Promise<void> {
  const db = await getDb();
  const statements = [...loadSchemaStatements(), ...SUPPLEMENTAL_STATEMENTS];

  for (const sql of statements) {
    try {
      await db.execute(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) continue;
      throw error;
    }
  }
}
