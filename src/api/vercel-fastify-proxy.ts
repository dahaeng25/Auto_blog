import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../create-app.js";

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false }).catch((error) => {
      // 실패 프라미스를 캐시하면 이후 요청이 전부 동일 오류로 고착됨
      appPromise = null;
      throw error;
    });
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
    (pathname === "/" || pathname === "/api" || pathname === "/api/proxy") &&
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
  params.delete("p");
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

function headerValue(
  value: string | string[] | number | undefined,
): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value);
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Vercel이 body를 미리 파싱한 뒤 inject 할 때 길이 불일치 → Fastify 파싱 실패
  "content-length",
  "content-encoding",
]);

function sendJsonError(
  res: VercelResponse,
  statusCode: number,
  error: string,
): void {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error }));
}

function forwardSetCookie(
  res: VercelResponse,
  response: {
    headers: Record<string, unknown>;
    cookies?: Array<{
      name: string;
      value: string;
      path?: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: string | boolean;
      maxAge?: number;
    }>;
  },
): void {
  const raw = response.headers["set-cookie"];
  if (raw !== undefined) {
    res.setHeader("Set-Cookie", headerValue(raw as string | string[] | number)!);
    return;
  }

  const cookies = response.cookies;
  if (!cookies?.length) return;

  res.setHeader(
    "Set-Cookie",
    cookies.map((c) => {
      const parts = [`${c.name}=${c.value}`];
      if (c.path) parts.push(`Path=${c.path}`);
      if (c.httpOnly) parts.push("HttpOnly");
      if (c.secure) parts.push("Secure");
      if (c.sameSite) parts.push(`SameSite=${c.sameSite}`);
      if (c.maxAge !== undefined) parts.push(`Max-Age=${c.maxAge}`);
      return parts.join("; ");
    }),
  );
}

/**
 * Vercel은 req.body 를 미리 파싱하므로 Fastify emit("request") 시
 * 본문 스트림이 비어 500이 날 수 있다 → inject 로 전달.
 */
export async function proxyToFastify(
  req: VercelRequest,
  res: VercelResponse,
  url?: string,
): Promise<void> {
  try {
    const targetUrl = url ?? normalizeApiUrl(req);
    const app = await getApp();
    await app.ready();

    const method = (req.method ?? "GET").toUpperCase();
    const hasPreParsedBody =
      req.body !== undefined &&
      req.body !== null &&
      method !== "GET" &&
      method !== "HEAD" &&
      method !== "OPTIONS";

    const useInject = Boolean(process.env.VERCEL) || hasPreParsedBody;

    if (!useInject) {
      req.url = targetUrl;
      app.server.emit("request", req, res);
      return;
    }

    let payload: string | undefined;
    if (hasPreParsedBody) {
      payload =
        typeof req.body === "string" || Buffer.isBuffer(req.body)
          ? String(req.body)
          : JSON.stringify(req.body);
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      headers[key] = Array.isArray(value) ? value.join(",") : String(value);
    }
    if (payload !== undefined && !headers["content-type"]) {
      headers["content-type"] = "application/json";
    }

    const response = await app.inject({
      method: method as
        | "GET"
        | "POST"
        | "PUT"
        | "PATCH"
        | "DELETE"
        | "OPTIONS"
        | "HEAD",
      url: targetUrl,
      headers,
      payload,
    });

    res.statusCode = response.statusCode;

    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "set-cookie") continue;
      const header = headerValue(value as string | string[] | number);
      if (header !== undefined) {
        res.setHeader(key, header);
      }
    }

    forwardSetCookie(res, response);
    res.end(response.rawPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[vercel-fastify-proxy]", message);
    sendJsonError(res, 500, `서버 프록시 오류: ${message}`);
  }
}
