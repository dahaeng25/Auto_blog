import { config } from "./index.js";
import type { Platform } from "./platforms.js";

export const ALL_PLATFORMS: Platform[] = ["naver", "tistory", "google"];

/** 환경 변수로 켜진 발행 플랫폼만 반환 */
export function getEnabledPlatforms(): Platform[] {
  return ALL_PLATFORMS.filter((p) => isPlatformEnabled(p));
}

export function isPlatformEnabled(platform: Platform): boolean {
  switch (platform) {
    case "naver":
      return config.enableNaverPublish;
    case "tistory":
      return config.enableTistoryPublish;
    case "google":
      return config.enableGooglePublish;
  }
}

export function platformBlogIdConfigured(platform: Platform): boolean {
  switch (platform) {
    case "naver":
      return Boolean(config.naverBlogId);
    case "tistory":
      return Boolean(config.tistoryBlogName);
    case "google":
      return Boolean(config.bloggerBlogId);
  }
}
