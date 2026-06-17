/**
 * 엔트리포인트: npm run auth:verify
 * 저장된 세션으로 글쓰기 화면까지 접근 가능한지 확인합니다.
 */
import { verifyAllSessions } from "../src/auth/session-verify.js";
import { PLATFORMS } from "../config/platforms.js";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   세션 검증 (글쓰기 화면 접근 테스트)    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const headless = process.env.PUBLISH_HEADLESS !== "false";
  const results = await verifyAllSessions(headless);

  if (results.length === 0) {
    console.log("검증할 플랫폼이 없습니다. .env에 NAVER_BLOG_ID / TISTORY_BLOG_NAME을 설정하세요.");
    process.exit(1);
  }

  let allOk = true;
  for (const r of results) {
    const name = PLATFORMS[r.platform].name;
    if (r.valid) {
      console.log(`✅ ${name}: ${r.detail}`);
    } else {
      allOk = false;
      console.log(`❌ ${name}: ${r.detail}`);
    }
  }

  if (!allOk) {
    console.log("\n→ npm run auth:setup 으로 다시 로그인하세요.");
    process.exit(1);
  }

  console.log("\n🎉 모든 세션이 유효합니다.");
}

main().catch((error: unknown) => {
  console.error("\n❌ 세션 검증 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
