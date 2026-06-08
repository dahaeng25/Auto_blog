import type { Platform } from "../../config/platforms.js";

/** 퍼블리싱 입력 데이터 */
export interface PublishInput {
  title: string;
  htmlBody: string;
  thumbnailPath: string;
}

/** 퍼블리싱 결과 */
export interface PublishResult {
  platform: Platform;
  success: boolean;
  postUrl?: string;
  error?: string;
}
