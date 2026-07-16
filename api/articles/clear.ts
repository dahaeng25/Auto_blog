import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 최근 원고 초기화
 * catch-all([[...path]])은 /api/articles/clear 를 404 처리할 수 있습니다.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  await proxyToFastify(req, res, "/api/articles/clear");
}
