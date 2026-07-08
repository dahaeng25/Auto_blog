import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../create-app.js";

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false });
  }
  return appPromise;
}

/** Vercel api/ 라우트에서 /api 접두사·catch-all path 쿼리를 Fastify 경로에 맞춤 */
export function normalizeApiUrl(req: VercelRequest): string {
  const rawUrl = req.url ?? "/";
  const parsed = new URL(rawUrl, "http://localhost");
  let pathname = parsed.pathname;

  const pathParam = req.query?.path;
  const shouldRebuildFromQuery =
    pathParam &&
    (pathname === "/" || pathname === "/api") &&
    (Array.isArray(pathParam) ? pathParam.length > 0 : Boolean(pathParam));

  if (shouldRebuildFromQuery) {
    const segments = (Array.isArray(pathParam) ? pathParam : [pathParam]).map(
      String,
    );
    pathname = `/api/${segments.join("/")}`;
  } else if (!(pathname === "/api" || pathname.startsWith("/api/"))) {
    const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
    pathname = `/api${suffix}`;
  }

  const params = new URLSearchParams(parsed.search);
  if (shouldRebuildFromQuery) params.delete("path");
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

export async function proxyToFastify(
  req: VercelRequest,
  res: VercelResponse,
  url?: string,
): Promise<void> {
  req.url = url ?? normalizeApiUrl(req);
  const app = await getApp();
  await app.ready();
  app.server.emit("request", req, res);
}
