import { config } from "../../config/index.js";
import { BetterSqliteExecutor } from "./better-sqlite-executor.js";
import { LibsqlExecutor } from "./libsql-executor.js";
import type { DbExecutor } from "./types.js";

let executor: DbExecutor | null = null;

/**
 * DB 백엔드 선택.
 * - Vercel: Turso(libsql) 필수
 * - 로컬/Docker: 기본 SQLite (USE_TURSO=true 일 때만 Turso)
 */
export function useLibsql(): boolean {
  if (config.isVercel) return true;
  if (process.env.USE_TURSO === "true") {
    return Boolean(process.env.TURSO_DATABASE_URL);
  }
  return false;
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
