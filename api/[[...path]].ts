import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/create-app.js";

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false });
  }
  return appPromise;
}

/** Vercel api/ 라우트에서 /api 접두사가 빠진 요청을 Fastify 경로에 맞춤 */
function normalizeApiUrl(rawUrl: string | undefined): string {
  const url = rawUrl ?? "/";
  const qIndex = url.indexOf("?");
  const pathname = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const query = qIndex >= 0 ? url.slice(qIndex) : "";

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return pathname + query;
  }

  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `/api${suffix}${query}`;
}

/**
 * Vercel 서버리스 — /api/* 요청 처리 (cron 제외)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  req.url = normalizeApiUrl(req.url);

  const app = await getApp();
  await app.ready();
  app.server.emit("request", req, res);
}
