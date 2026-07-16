import { getDb } from "./client.js";
import { loadSchemaStatements } from "./schema-loader.js";
import { migrateUserScopedSchema } from "./migrate-user-scope.js";

/**
 * DB 스키마를 보장합니다. Vercel/Turso 첫 요청 전에 호출하세요.
 */
export async function ensureSchema(): Promise<void> {
  const db = await getDb();
  const statements = loadSchemaStatements();

  for (const sql of statements) {
    try {
      await db.execute(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) continue;
      throw error;
    }
  }

  await migrateUserScopedSchema(db);
}

export { migrateUserScopedSchema } from "./migrate-user-scope.js";
