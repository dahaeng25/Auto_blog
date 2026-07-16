import { config } from "../../config/index.js";
import type { Platform } from "../../config/platforms.js";
import type { PlatformCredentials } from "./auto-login.js";

export function envCredentials(platform: Platform): PlatformCredentials | null {
  if (platform === "naver") {
    if (!config.naverId || !config.naverPassword) return null;
    return { id: config.naverId, password: config.naverPassword };
  }
  if (platform === "tistory") {
    const id = config.kakaoId || config.tistoryId;
    const password = config.kakaoPassword || config.tistoryPassword;
    if (!id || !password) return null;
    return { id, password };
  }
  return null;
}

/** 서버 환경변수에 플랫폼 로그인 계정이 있는지 (비밀번호는 노출하지 않음) */
export function hasEnvCredentials(platform: Platform): boolean {
  return envCredentials(platform) !== null;
}

export function resolveCredentials(
  platform: Platform,
  override?: PlatformCredentials,
): PlatformCredentials | null {
  if (override?.id?.trim() && override.password) {
    return {
      id: override.id.trim(),
      password: override.password,
    };
  }
  return envCredentials(platform);
}
