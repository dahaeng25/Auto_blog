/**
 * 엔트리포인트: npm run run:once
 * cron 없이 전체 파이프라인을 1회 즉시 실행합니다.
 */
import { logger } from "../src/monitoring/logger.js";
import { runOrchestration } from "../src/pipeline.js";

runOrchestration()
  .then((result) => {
    logger.info(`제목: ${result.draft.title}`);
    logger.info(`썸네일: ${result.thumbnailPath}`);
    for (const r of result.publishResults) {
      logger.info(
        `[${r.platform}] ${r.success ? "성공" : "실패"}${r.postUrl ? ` → ${r.postUrl}` : ""}`,
      );
    }
  })
  .catch(() => {
    process.exit(1);
  });
