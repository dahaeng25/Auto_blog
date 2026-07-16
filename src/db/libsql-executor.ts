import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";
import type { DbExecutor, SqlResult } from "./types.js";
import { loadSchemaStatements } from "./schema-loader.js";

let libsqlModule: typeof import("@libsql/client") | null = null;

async function loadLibsql(): Promise<typeof import("@libsql/client")> {
  if (!libsqlModule) {
    libsqlModule = await import("@libsql/client");
  }
  return libsqlModule;
}
let client: import("@libsql/client").Client | null = null;
let migrated = false;

async function migrateLibsql(
  db: import("@libsql/client").Client,
): Promise<void> {
  if (migrated) return;

  if (config.databaseUrl.startsWith("file:")) {
    const dbPath = config.databaseUrl.replace(/^file:/, "");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const statements = loadSchemaStatements();

  for (const sql of statements) {
    try {
      await db.execute({ sql, args: [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) throw error;
    }
  }

  const { migrateUserScopedSchema } = await import("./migrate-user-scope.js");
  await migrateUserScopedSchema({
    execute: async (sql, args = []) => {
      const result = await db.execute({ sql, args: args as never[] });
      return {
        rows: result.rows as Record<string, unknown>[],
        lastInsertRowid: result.lastInsertRowid,
      };
    },
    batch: async () => {
      throw new Error("batch not used during migrate");
    },
  });

  migrated = true;
}

async function getClient(): Promise<import("@libsql/client").Client> {
  if (!client) {
    const { createClient } = await loadLibsql();
    client = createClient({
      url: config.databaseUrl,
      authToken: config.databaseAuthToken || undefined,
    });
    await migrateLibsql(client);
  }
  return client;
}

export class LibsqlExecutor implements DbExecutor {
  async execute(sql: string, args: unknown[] = []): Promise<SqlResult> {
    const db = await getClient();
    const result = await db.execute({ sql, args: args as never[] });
    return {
      rows: result.rows as Record<string, unknown>[],
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async batch(
    statements: Array<{ sql: string; args?: unknown[] }>,
  ): Promise<SqlResult[]> {
    const db = await getClient();
    const results = await db.batch(
      statements.map((s) => ({
        sql: s.sql,
        args: (s.args ?? []) as never[],
      })),
    );
    return results.map((r: { rows: unknown[]; lastInsertRowid?: number | bigint }) => ({
      rows: r.rows as Record<string, unknown>[],
      lastInsertRowid: r.lastInsertRowid,
    }));
  }
}
