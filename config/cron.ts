/**
 * node-cron 스케줄 설정.
 * 기본값: 매일 오전 9시 (KST)
 *
 * 형식: 분 시 일 월 요일
 * 예시:
 *   "0 9 * * *"   — 매일 09:00
 *   "0 18 * * *"  — 매일 18:00
 *   "0 9 * * 1-5" — 평일 09:00
 */
export const CRON_SCHEDULE = process.env.CRON_SCHEDULE ?? "0 9 * * *";
export const CRON_TIMEZONE = process.env.CRON_TIMEZONE ?? "Asia/Seoul";

/** true이면 프로세스 시작 시 파이프라인 1회 즉시 실행 */
export const RUN_ON_START = process.env.RUN_ON_START === "true";
