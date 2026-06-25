import { logger } from "./logger.js";

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * 에러 발생 시 안전 종료 — 로그 기록 후 프로세스 종료
 */
export function gracefulExit(code = 1, reason?: string): never {
  if (shuttingDown) {
    process.exit(code);
  }
  shuttingDown = true;

  if (reason) {
    logger.error(`[Shutdown] ${reason}`);
  }
  logger.error(`[Shutdown] 프로세스 종료 (code=${code})`);
  process.exit(code);
}
