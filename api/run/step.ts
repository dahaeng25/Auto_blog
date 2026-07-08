import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 단계별 파이프라인 실행
 * catch-all은 /api/run/step 다중 세그먼트를 404 처리할 수 있습니다.
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
  await proxyToFastify(req, res, `/api/run/step${qs}`);
}
