import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "../config/index.js";
import { resolveCronUser } from "../src/auth/user-auth.js";
import { runWithUser } from "../src/auth/user-context.js";
import { ensureSchema } from "../src/db/migrate.js";
import { logger } from "../src/monitoring/logger.js";
import { isPipelineRunning, runOrchestration } from "../src/pipeline.js";

/**
 * Vercel Cron — vercel.json에서 스케줄 등록
 * Authorization: Bearer CRON_SECRET 헤더 검증
 *
 * 사용자 격리: AUTH_CRON_USER_ID 또는 가입된 첫 사용자 컨텍스트로 실행
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
    await ensureSchema();
    const cronUser = await resolveCronUser();
    if (!cronUser) {
      res.status(503).json({
        error:
          "Cron 실행용 사용자가 없습니다. 대시보드에서 회원가입하거나 AUTH_CRON_USER_ID를 설정하세요.",
      });
      return;
    }

    logger.info(
      `Vercel cron — 파이프라인 시작 (user=${cronUser.username}#${cronUser.id})`,
    );
    const result = await runWithUser(cronUser, () =>
      runOrchestration({ trigger: "vercel-cron" }),
    );
    res.status(200).json({
      ok: true,
      title: result.draft.title,
      userId: cronUser.id,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
