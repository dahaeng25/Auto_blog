import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../../../src/api/vercel-fastify-proxy.js";

/**
 * Vercel 명시 라우트 — 네이버·티스토리 계정 연결(자동 로그인)
 * Playwright + Chromium 이 필요하므로 maxDuration 300 · includeFiles 유지.
 * 클라이언트는 phase=start(202) 후 phase=run 을 호출하고 상태를 폴링합니다.
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

  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  try {
    await proxyToFastify(req, res, `/api/sessions/${platform}/refresh${qs}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/sessions/refresh]", message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `연결 처리 오류: ${message}` }));
    }
  }
}
