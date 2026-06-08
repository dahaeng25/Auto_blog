import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { PLATFORMS, type Platform } from "../../config/platforms.js";

/**
 * 플랫폼별 storage_state JSON 파일 경로를 반환합니다.
 */
export function getStateFilePath(platform: Platform): string {
  return PLATFORMS[platform].stateFile;
}

/**
 * 저장된 세션 파일이 존재하는지 확인합니다.
 */
export async function hasSession(platform: Platform): Promise<boolean> {
  try {
    await fs.access(getStateFilePath(platform));
    return true;
  } catch {
    return false;
  }
}

/**
 * auth 디렉토리가 없으면 생성합니다.
 */
async function ensureAuthDir(): Promise<void> {
  const authDir = path.dirname(getStateFilePath("naver"));
  await fs.mkdir(authDir, { recursive: true });
}

/**
 * 브라우저 컨텍스트의 쿠키/로컬스토리지를 JSON 파일로 저장합니다.
 */
export async function saveSession(
  platform: Platform,
  context: BrowserContext,
): Promise<string> {
  await ensureAuthDir();
  const statePath = getStateFilePath(platform);
  await context.storageState({ path: statePath });
  return statePath;
}

/**
 * 세션 파일 존재 여부를 검증하고, 없으면 에러를 던집니다.
 */
export async function requireSession(platform: Platform): Promise<string> {
  const statePath = getStateFilePath(platform);
  const exists = await hasSession(platform);

  if (!exists) {
    throw new Error(
      `[${PLATFORMS[platform].name}] 세션 파일이 없습니다: ${statePath}\n` +
        `먼저 'npm run auth:setup'을 실행하여 수동 로그인 후 세션을 저장하세요.`,
    );
  }

  return statePath;
}
