import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 세션 JSON 업로드
 * filesystem 라우트가 rewrite보다 우선하므로, refresh와 같이 명시합니다.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const raw = req.query.platform;
  const platform = Array.isArray(raw) ? raw[0] : raw;
  if (!platform) {
    res.status(400).json({ error: "플랫폼이 필요합니다." });
    return;
  }

  if (req.body === undefined || req.body === null) {
    res.status(400).json({ error: "세션 JSON이 필요합니다." });
    return;
  }

  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  await proxyToFastify(req, res, `/api/sessions/${platform}${qs}`);
}
