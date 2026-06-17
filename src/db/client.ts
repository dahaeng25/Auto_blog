import { config } from "../../config/index.js";
import { BetterSqliteExecutor } from "./better-sqlite-executor.js";
import { LibsqlExecutor } from "./libsql-executor.js";
import type { DbExecutor } from "./types.js";

let executor: DbExecutor | null = null;

/** Turso(Vercel) 또는 TURSO_DATABASE_URL 설정 시 libsql, 그 외 로컬 SQLite */
function useLibsql(): boolean {
  return (
    config.isVercel ||
    Boolean(process.env.TURSO_DATABASE_URL) ||
    config.databaseUrl.startsWith("libsql:")
  );
}

export async function getDb(): Promise<DbExecutor> {
  if (!executor) {
    if (useLibsql()) {
      executor = new LibsqlExecutor();
    } else {
      try {
        executor = new BetterSqliteExecutor();
      } catch {
        throw new Error(
          "로컬 SQLite 초기화 실패. npm install better-sqlite3 를 실행하세요.",
        );
      }
    }
  }
  return executor;
}
