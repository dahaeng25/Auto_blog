import { connectJobStore } from "../api/connect-job-store.js";
import type { Platform } from "../../config/platforms.js";

let activePlatform: Platform | null = null;

/** 계정 연결 작업 중 진행 로그 대상 플랫폼 */
export function bindConnectProgress(platform: Platform): void {
  activePlatform = platform;
}

export function unbindConnectProgress(): void {
  activePlatform = null;
}

export function getBoundConnectPlatform(): Platform | null {
  return activePlatform;
}

/** 연결 단계 메시지를 DB·UI 폴링용 job에 기록 */
export async function reportConnectProgress(
  message: string,
  screenshot?: Buffer,
): Promise<void> {
  if (!activePlatform) return;
  await connectJobStore.appendStep(activePlatform, message, screenshot);
}
