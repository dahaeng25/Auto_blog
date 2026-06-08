/**
 * 엔트리포인트: npm run thumbnail:test
 * Phase 3 썸네일 렌더러를 단독 테스트합니다.
 */
import { ThumbnailRenderer } from "../src/thumbnail/thumbnail-renderer.js";

async function main(): Promise<void> {
  const renderer = new ThumbnailRenderer();

  const outputPath = await renderer.render({
    text: "AI가 바꾸는 블로그의 미래",
    subtitle: "자동화 시대, 콘텐츠 전략은 어떻게 달라질까?",
  });

  console.log(`\n✅ 썸네일 생성 완료: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("\n❌ 썸네일 생성 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
