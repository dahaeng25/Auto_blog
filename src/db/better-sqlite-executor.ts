import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../../config/index.js";
import type { DbExecutor, SqlResult } from "./types.js";

let db: Database.Database | null = null;
let migrated = false;

function getSqlite(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

function migrateSqlite(database: Database.Database): void {
  if (migrated) return;
  const schemaPath = path.join(config.dataDir, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  database.exec(schema);
  migrated = true;
}

export class BetterSqliteExecutor implements DbExecutor {
  private readonly database: Database.Database;

  constructor() {
    this.database = getSqlite();
    migrateSqlite(this.database);
  }

  async execute(sql: string, args: unknown[] = []): Promise<SqlResult> {
    const stmt = this.database.prepare(sql);
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
    const tx = this.database.transaction(() =>
      statements.map(({ sql, args = [] }) => {
        const result = this.database.prepare(sql).run(...args);
        return { rows: [], lastInsertRowid: result.lastInsertRowid };
      }),
    );
    return tx();
  }
}
