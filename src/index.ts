/**
 * Phase 5 엔트리포인트: npm start
 * node-cron으로 매일 지정 시각에 전체 파이프라인을 실행합니다.
 */
import cron from "node-cron";
import { config } from "../config/index.js";
import { withSystemUser } from "./auth/with-system-user.js";
import { logger } from "./monitoring/logger.js";
import { runOrchestration } from "./pipeline.js";

async function executePipeline(trigger: string): Promise<void> {
  logger.info(`파이프라인 트리거: ${trigger}`);
  try {
    await withSystemUser((user) => {
      logger.info(`사용자 컨텍스트: @${user.username} (#${user.id})`);
      return runOrchestration({ trigger });
    });
  } catch {
    // runOrchestration 내부에서 이미 로깅·Discord 알림 처리
  }
}

function startScheduler(): void {
  const { cronSchedule, cronTimezone, runOnStart } = config;

  if (!cron.validate(cronSchedule)) {
    logger.error(`잘못된 CRON_SCHEDULE: ${cronSchedule}`);
    process.exit(1);
  }

  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║   Blog Orchestrator — 스케줄러 시작      ║");
  logger.info("╚══════════════════════════════════════════╝");
  logger.info(`스케줄: ${cronSchedule} (${cronTimezone})`);
  logger.info(`DRY-RUN: ${config.publishDryRun}`);

  cron.schedule(
    cronSchedule,
    () => {
      void executePipeline("cron");
    },
    { timezone: cronTimezone },
  );

  if (runOnStart) {
    logger.info("RUN_ON_START=true — 시작 시 즉시 1회 실행");
    void executePipeline("run-on-start");
  }

  logger.info("스케줄러 대기 중... (Ctrl+C로 종료)");
}

startScheduler();
