/**
 * 엔트리포인트: npm run run:once
 * cron 없이 전체 파이프라인을 1회 즉시 실행합니다.
 * 실행 시 블로그 주제/키워드를 대화형으로 입력받습니다.
 */
import { parseTopicFromArgv, resolveBlogTopic } from "../src/cli/resolve-blog-topic.js";
import { withSystemUser } from "../src/auth/with-system-user.js";
import { logger } from "../src/monitoring/logger.js";
import { notifyError } from "../src/monitoring/discord-notifier.js";
import { gracefulExit } from "../src/monitoring/graceful-shutdown.js";
import { runOrchestration } from "../src/pipeline.js";

async function main(): Promise<void> {
  const cliTopic = parseTopicFromArgv(process.argv.slice(2));
  const blogTopic = await resolveBlogTopic({ cliTopic });

  const result = await withSystemUser(async (user) => {
    logger.info(`사용자 컨텍스트: @${user.username} (#${user.id})`);
    return runOrchestration({ blogTopic });
  });

  logger.info(`제목: ${result.draft.title}`);
  logger.info(`썸네일: ${result.thumbnailPath}`);
  for (const r of result.publishResults) {
    logger.info(
      `[${r.platform}] ${r.success ? "성공" : "실패"}${r.postUrl ? ` → ${r.postUrl}` : ""}`,
    );
  }
}

main().catch(async () => {
  try {
    await notifyError(new Error("run:once 파이프라인 실패"), {
      stage: "run-once",
    });
  } catch {
    /* Discord 미설정 */
  }
  gracefulExit(1);
});
