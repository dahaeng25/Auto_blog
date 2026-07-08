import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 서버리스 — /api/* 요청 처리 (cron·명시 라우트 제외)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await proxyToFastify(req, res);
}
