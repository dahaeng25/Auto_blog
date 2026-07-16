/**
 * 웹 서버 엔트리포인트 — API + 대시보드 + cron 스케줄러
 * Docker/로컬: npm run web
 */
import fs from "node:fs";
import cron from "node-cron";
import { config } from "../config/index.js";
import { withSystemUser } from "./auth/with-system-user.js";
import { createApp } from "./create-app.js";
import { useLibsql } from "./db/client.js";
import { logger } from "./monitoring/logger.js";
import { isPipelineRunning, runOrchestration } from "./pipeline.js";

function startScheduler(): void {
  if (!config.enableWebScheduler) {
    logger.info("ENABLE_WEB_SCHEDULER=false — cron 스케줄러 비활성화");
    return;
  }

  if (!cron.validate(config.cronSchedule)) {
    logger.error(`잘못된 CRON_SCHEDULE: ${config.cronSchedule}`);
    process.exit(1);
  }

  cron.schedule(
    config.cronSchedule,
    () => {
      void (async () => {
        if (await isPipelineRunning()) {
          logger.warn("cron 트리거 — 이미 실행 중이어서 건너뜀");
          return;
        }
        logger.info("cron 트리거 — 파이프라인 시작");
        void withSystemUser(() =>
          runOrchestration({ trigger: "cron" }),
        ).catch(() => {});
      })();
    },
    { timezone: config.cronTimezone },
  );

  logger.info(`cron 스케줄러 등록: ${config.cronSchedule} (${config.cronTimezone})`);

  if (config.runOnStart) {
    logger.info("RUN_ON_START=true — 시작 시 즉시 1회 실행");
    void withSystemUser(() =>
      runOrchestration({ trigger: "run-on-start" }),
    ).catch(() => {});
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(config.authDir, { recursive: true });
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });

  const app = await createApp({ serveStatic: true });
  startScheduler();

  await app.listen({ port: config.port, host: "0.0.0.0" });

  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║   Blog Orchestrator — 웹 서버 시작       ║");
  logger.info("╚══════════════════════════════════════════╝");
  logger.info(`대시보드: http://0.0.0.0:${config.port}`);
  logger.info(`DRY-RUN: ${config.publishDryRun}`);
  logger.info(`DB: ${useLibsql() ? "Turso (libsql)" : `SQLite (${config.dbPath})`}`);
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
