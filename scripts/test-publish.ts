/**
 * 엔트리포인트: npm run publish:test
 * Phase 4 퍼블리싱을 테스트합니다.
 *
 * 사전 준비:
 * 1. npm run auth:setup (세션 파일)
 * 2. .env에 NAVER_BLOG_ID, TISTORY_BLOG_NAME 설정
 * 3. output/thumbnails/thumbnail_최종.png 존재 (npm run thumbnail:test)
 *
 * 기본값 PUBLISH_DRY_RUN=true — 발행 버튼 클릭 없이 입력까지만 테스트
 */
import path from "node:path";
import { config } from "../config/index.js";
import { PublishPipeline } from "../src/publishing/publish-pipeline.js";

const SAMPLE_HTML = `
<h2>서론</h2>
<p>이 글은 <strong>퍼블리싱 모듈 테스트</strong>용 샘플 원고입니다.</p>
<h2>본론</h2>
<p>클립보드 붙여넣기와 insertHTML 방식으로 서식이 보존되는지 확인합니다.</p>
<ul>
  <li>항목 1: 자동화 테스트</li>
  <li>항목 2: 에디터 호환성</li>
</ul>
<h2>결론</h2>
<p>테스트가 성공하면 Phase 5 오케스트레이션으로 연결합니다.</p>
`.trim();

async function main(): Promise<void> {
  const thumbnailPath = path.join(
    config.thumbnailsDir,
    "thumbnail_최종.png",
  );

  const pipeline = new PublishPipeline();

  const results = await pipeline.run({
    title: "[테스트] 블로그 오케스트레이터 퍼블리싱 검증",
    htmlBody: SAMPLE_HTML,
    thumbnailPath,
  });

  console.log("\n─── 결과 ───");
  for (const r of results) {
    console.log(
      `${r.platform}: ${r.success ? "성공" : "실패"}${r.postUrl ? ` → ${r.postUrl}` : ""}`,
    );
  }

  if (config.publishDryRun) {
    console.log("\nℹ️  PUBLISH_DRY_RUN=true — 실제 발행은 수행되지 않았습니다.");
    console.log("   실제 발행 테스트: .env에서 PUBLISH_DRY_RUN=false 설정");
  }
}

main().catch((error: unknown) => {
  console.error("\n❌ 퍼블리싱 테스트 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
