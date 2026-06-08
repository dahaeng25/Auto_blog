/**
 * 엔트리포인트: npm run content:test
 * Phase 2 콘텐츠 파이프라인을 1회 실행합니다.
 * .env에 OPENAI_API_KEY가 설정되어 있어야 합니다.
 */
import { ContentPipeline } from "../src/content/content-pipeline.js";

async function main(): Promise<void> {
  const pipeline = new ContentPipeline();

  try {
    const draft = await pipeline.run();

    console.log("\n─── 생성 결과 요약 ───");
    console.log(`제목: ${draft.title}`);
    console.log(`썸네일 문구: ${draft.thumbnailText}`);
    console.log(`본문 미리보기: ${draft.htmlBody.slice(0, 120)}...`);
  } finally {
    pipeline.close();
  }
}

main().catch((error: unknown) => {
  console.error("\n❌ 콘텐츠 생성 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
