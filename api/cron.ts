import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "../config/index.js";
import { logger } from "../src/monitoring/logger.js";
import { isPipelineRunning, runOrchestration } from "../src/pipeline.js";

/**
 * Vercel Cron — vercel.json에서 스케줄 등록
 * Authorization: Bearer CRON_SECRET 헤더 검증
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (config.cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${config.cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (await isPipelineRunning()) {
    logger.warn("Vercel cron — 이미 실행 중");
    res.status(409).json({ error: "파이프라인이 이미 실행 중입니다." });
    return;
  }

  try {
    logger.info("Vercel cron — 파이프라인 시작");
    const result = await runOrchestration({ trigger: "vercel-cron" });
    res.status(200).json({
      ok: true,
      title: result.draft.title,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
