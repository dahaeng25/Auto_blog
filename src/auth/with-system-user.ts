import { ensureSchema } from "../db/migrate.js";
import { resolveCronUser } from "./user-auth.js";
import { runWithUser, type AuthUser } from "./user-context.js";

/**
 * CLI / 로컬 cron용 — AUTH_CRON_USER_ID 또는 첫 가입 사용자로 ALS 실행.
 */
export async function withSystemUser<T>(
  fn: (user: AuthUser) => Promise<T>,
): Promise<T> {
  await ensureSchema();
  const user = await resolveCronUser();
  if (!user) {
    throw new Error(
      "실행할 사용자가 없습니다. 대시보드에서 회원가입하거나 AUTH_CRON_USER_ID를 설정하세요.",
    );
  }
  return runWithUser(user, () => fn(user));
}
