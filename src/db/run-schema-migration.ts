import { loadSchemaStatements } from "./schema-loader.js";
import { migrateUserScopedSchema } from "./migrate-user-scope.js";
import type { DbExecutor } from "./types.js";

/** schema.sql 적용 중 무시해도 되는 오류 (기존 테이블/미마이그레이션 컬럼) */
export function isIgnorableSchemaError(message: string): boolean {
  return (
    /already exists/i.test(message) ||
    /no such column/i.test(message) ||
    /duplicate column/i.test(message)
  );
}

/**
 * schema.sql 문을 순서대로 실행합니다.
 * 기존 Turso DB에 user_id 가 없을 때 CREATE INDEX …(user_id) 가
 * 실패해도 이후 마이그레이션이 돌 수 있도록 soft-fail 합니다.
 */
export async function applySchemaStatements(
  execute: (sql: string) => Promise<unknown>,
): Promise<void> {
  const statements = loadSchemaStatements();
  for (const sql of statements) {
    try {
      await execute(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isIgnorableSchemaError(message)) continue;
      throw error;
    }
  }
}

/**
 * CREATE TABLE → user_id 마이그레이션 → 인덱스 재적용.
 * (인덱스가 user_id 를 참조하므로 마이그레이션 전에 실패할 수 있음)
 */
export async function runSchemaMigration(db: DbExecutor): Promise<void> {
  await applySchemaStatements((sql) => db.execute(sql));
  await migrateUserScopedSchema(db);
  // 마이그레이션으로 user_id 가 생긴 뒤, 실패했던 인덱스를 다시 생성
  await applySchemaStatements((sql) => db.execute(sql));
}
