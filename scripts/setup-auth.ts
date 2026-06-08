/**
 * 엔트리포인트: npm run auth:setup
 * 네이버·티스토리 1회 수동 로그인 후 세션 파일을 생성합니다.
 */
import { runAuthSetup } from "../src/auth/setup-auth.js";

runAuthSetup().catch((error: unknown) => {
  console.error("\n❌ 인증 설정 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
