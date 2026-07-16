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
  const segments = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  const apiPath = segments.length > 0 ? `/api/${segments.join("/")}` : "/api";

  const parsed = new URL(req.url ?? "/", "http://localhost");
  const params = new URLSearchParams(parsed.search);
  params.delete("p");
  const qs = params.toString();
  const url = qs ? `${apiPath}?${qs}` : apiPath;

  await proxyToFastify(req, res, url);
}
