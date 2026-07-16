import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyToFastify } from "../src/api/vercel-fastify-proxy.js";

/**
 * Hobby 플랜 함수 수 제한(12) 대응 — 경량 /api/* 를 Fastify로 프록시.
 * Chromium이 필요한 run/cron/refresh 는 별도 파일로 유지(파일시스템 라우트가 rewrite보다 우선).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const raw = req.query.p;
  // Vercel :path* → "auth/signup" 한 문자열 또는 ["auth","signup"] 배열
  let segments: string[];
  if (Array.isArray(raw)) {
    segments = raw.flatMap((s) => String(s).split("/").filter(Boolean));
  } else if (raw) {
    segments = String(raw).split("/").filter(Boolean);
  } else {
    segments = [];
  }
  const apiPath = segments.length > 0 ? `/api/${segments.join("/")}` : "/api";

  const parsed = new URL(req.url ?? "/", "http://localhost");
  const params = new URLSearchParams(parsed.search);
  params.delete("p");
  const qs = params.toString();
  const url = qs ? `${apiPath}?${qs}` : apiPath;

  try {
    await proxyToFastify(req, res, url);
  } catch (error) {
    // proxyToFastify 가 대부분 처리하지만, 예외 누수 시에도 JSON 으로 응답
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/proxy]", message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `프록시 오류: ${message}` }));
    }
  }
}
