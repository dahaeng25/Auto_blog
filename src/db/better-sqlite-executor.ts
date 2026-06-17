import fs from "node:fs";
import path from "node:path";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { config } from "../../config/index.js";
import type { DbExecutor, SqlResult } from "./types.js";

let db: SqliteDatabase | null = null;
let migrated = false;

async function ensureSqlite(): Promise<SqliteDatabase> {
  if (db) return db;

  const mod = await import("better-sqlite3");
  const BetterSqlite3 = mod.default as new (path: string) => SqliteDatabase;

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const database = new BetterSqlite3(config.dbPath);
  database.pragma("journal_mode = WAL");

  if (!migrated) {
    const schemaPath = path.join(config.dataDir, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    database.exec(schema);
    migrated = true;
  }

  db = database;
  return database;
}

export class BetterSqliteExecutor implements DbExecutor {
  async execute(sql: string, args: unknown[] = []): Promise<SqlResult> {
    const database = await ensureSqlite();
    const stmt = database.prepare(sql);
    const verb = sql.trim().split(/\s+/)[0]?.toUpperCase();

    if (verb === "SELECT") {
      const rows = stmt.all(...args) as Record<string, unknown>[];
      return { rows };
    }

    const result = stmt.run(...args);
    return { rows: [], lastInsertRowid: result.lastInsertRowid };
  }

  async batch(
    statements: Array<{ sql: string; args?: unknown[] }>,
  ): Promise<SqlResult[]> {
    const database = await ensureSqlite();
    const tx = database.transaction(() =>
      statements.map(({ sql, args = [] }) => {
        const result = database.prepare(sql).run(...args);
        return { rows: [], lastInsertRowid: result.lastInsertRowid };
      }),
    );
    return tx();
  }
}
