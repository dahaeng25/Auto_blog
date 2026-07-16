import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../src/api/vercel-fastify-proxy.js";

/** Vercel 명시 라우트 — 로그인 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  await proxyToFastify(req, res, "/api/auth/login");
}
