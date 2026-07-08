import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PLATFORMS, type Platform } from "../../config/platforms.js";
import { logger } from "../../src/monitoring/logger.js";
import { saveStoredSession } from "../../src/storage/session-store.js";
import { ensureSchema } from "../../src/db/migrate.js";

/**
 * Vercel 명시 라우트 — 세션 JSON 업로드
 * catch-all([[...path]])과 별도로 두어 404를 방지합니다.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const platformRaw = req.query.platform;
  const platform = Array.isArray(platformRaw) ? platformRaw[0] : platformRaw;

  if (!platform || !(platform in PLATFORMS)) {
    res.status(400).json({ error: "지원하지 않는 플랫폼입니다." });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "세션 JSON이 필요합니다." });
    return;
  }

  try {
    await ensureSchema();
    const json = typeof body === "string" ? body : JSON.stringify(body);
    await saveStoredSession(platform as Platform, json);
    logger.info(`세션 업로드 완료: ${platform}`);
    res.status(200).json({ ok: true, platform });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`세션 업로드 실패: ${platform} — ${message}`);
    res.status(500).json({
      error:
        "세션 저장 실패. Vercel에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 이 설정됐는지 확인하세요.",
      detail: message,
    });
  }
}
