import { getDb } from "./client.js";
import { runSchemaMigration } from "./run-schema-migration.js";

/**
 * DB 스키마를 보장합니다. Vercel/Turso 첫 요청 전에 호출하세요.
 */
export async function ensureSchema(): Promise<void> {
  const db = await getDb();
  await runSchemaMigration(db);
}

export {
  applySchemaStatements,
  isIgnorableSchemaError,
  runSchemaMigration,
} from "./run-schema-migration.js";
export { migrateUserScopedSchema } from "./migrate-user-scope.js";
