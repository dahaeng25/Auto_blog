import type { Platform } from "../../config/platforms.js";
import type { NaverImageSet } from "./images/prepare-naver-images.js";

/** 퍼블리싱 입력 데이터 */
export interface PublishInput {
  title: string;
  htmlBody: string;
  thumbnailPath: string;
  blogTopic?: string;
  /** 네이버 전용 — 키워드 기반 파일명·메타가 적용된 이미지 세트 */
  naverImages?: NaverImageSet;
}

/** 퍼블리싱 결과 */
export interface PublishResult {
  platform: Platform;
  success: boolean;
  postUrl?: string;
  error?: string;
}
