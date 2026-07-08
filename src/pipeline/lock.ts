/** 파이프라인·단계 실행 동시 실행 방지 락 */
let isRunning = false;

export function isPipelineRunning(): boolean {
  return isRunning;
}

export function acquirePipelineLock(): boolean {
  if (isRunning) return false;
  isRunning = true;
  return true;
}

export function releasePipelineLock(): void {
  isRunning = false;
}

export interface OrchestrationOptions {
  blogTopic?: string;
  blogRegion?: string;
  trigger?: string;
}
