import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 원고 상세 JSON
 * catch-all([[...path]])은 /api/articles/:id 를 404 처리할 수 있습니다.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    res.status(400).json({ error: "원고 ID가 필요합니다." });
    return;
  }

  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  await proxyToFastify(req, res, `/api/articles/${id}${qs}`);
}
