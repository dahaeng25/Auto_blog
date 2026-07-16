import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 서버리스 — /api/* 요청 처리 (cron·명시 라우트 제외)
 * 브라우저/파이프라인은 api/run.ts · api/run/step.ts · api/cron.ts · sessions/.../refresh.ts 로 분리됨
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await proxyToFastify(req, res);
}
