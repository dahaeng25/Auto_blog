/**
 * 엔트리포인트: npm run thumbnail:test
 */
import { ThumbnailRenderer } from "../src/thumbnail/thumbnail-renderer.js";
import {
  buildKeywordSlug,
  extractMainKeywords,
} from "../src/publishing/images/keyword-slug.js";
import { config } from "../config/index.js";

async function main(): Promise<void> {
  const blogTopic = config.blogTopic || "D-8-4, 외국인 창업";
  const keywords = extractMainKeywords(blogTopic, "");
  const keywordSlug = buildKeywordSlug(keywords);

  const renderer = new ThumbnailRenderer();

  const outputPath = await renderer.render({
    topLabel: "D-8-4 외국인 창업",
    text: "비자 전쟁에서\n살아남는 법",
    keywords,
    keywordSlug,
    outputFilename: `${keywordSlug}1.png`,
  });

  console.log(`\n✅ 썸네일 생성 완료: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("\n❌ 썸네일 생성 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
