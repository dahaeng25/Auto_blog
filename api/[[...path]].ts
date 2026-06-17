import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/create-app.js";

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false });
  }
  return appPromise;
}

/**
 * Vercel 서버리스 — /api/* 요청 처리 (cron 제외)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const app = await getApp();
  await app.ready();
  app.server.emit("request", req, res);
}
