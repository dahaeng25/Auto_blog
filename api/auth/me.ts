import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/** Vercel 명시 라우트 — 현재 로그인 사용자 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  await proxyToFastify(req, res, `/api/auth/me${qs}`);
}
