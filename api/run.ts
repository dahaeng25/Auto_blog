import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 전체 파이프라인 실행
 * Chromium/썸네일 자산을 이 함수에만 묶어 catch-all을 가볍게 유지합니다.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  await proxyToFastify(req, res, `/api/run${qs}`);
}
