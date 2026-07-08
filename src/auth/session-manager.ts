import type { BrowserContext } from "playwright-core";
import type { Platform } from "../../config/platforms.js";
import { PLATFORMS } from "../../config/platforms.js";
import {
  hasStoredSession,
  resolveSessionPath,
  saveStoredSession,
} from "../storage/session-store.js";

export function getStateFilePath(platform: Platform): string {
  return PLATFORMS[platform].stateFile;
}

export async function hasSession(platform: Platform): Promise<boolean> {
  return hasStoredSession(platform);
}

export async function saveSession(
  platform: Platform,
  context: BrowserContext,
): Promise<string> {
  const state = await context.storageState();
  const json = JSON.stringify(state);
  await saveStoredSession(platform, json);
  return resolveSessionPath(platform);
}

export async function requireSession(platform: Platform): Promise<string> {
  return resolveSessionPath(platform);
}
