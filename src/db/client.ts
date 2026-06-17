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
      try {
        executor = new LibsqlExecutor();
      } catch {
        throw new Error(
          "Turso(libsql) 연결에 실패했습니다. TURSO_DATABASE_URL과 TURSO_AUTH_TOKEN을 확인하세요.",
        );
      }
    } else {
      executor = new BetterSqliteExecutor();
    }
  }
  return executor;
}
