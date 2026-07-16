/**
 * 엔트리포인트: npm run auth:setup
 * 네이버·티스토리 1회 수동 로그인 후 세션을 DB·auth/*_state.json 에 저장합니다.
 * 생성된 JSON은 대시보드「세션 업로드」에서 Vercel로 올릴 수 있습니다.
 */
import { withSystemUser } from "../src/auth/with-system-user.js";
import { runAuthSetup } from "../src/auth/setup-auth.js";

withSystemUser(async (user) => {
  console.log(`세션 저장 계정: @${user.username} (#${user.id})`);
  await runAuthSetup();
}).catch((error: unknown) => {
  console.error("\n❌ 인증 설정 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
