import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config/index.js";

const PUBLIC_PATHS = new Set(["/health", "/api/health", "/api/meta"]);

/**
 * API_KEY가 설정된 경우 X-API-Key 헤더를 검증합니다.
 * 로컬 개발(API_KEY 미설정)에서는 인증을 건너뜁니다.
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!config.apiKey) return;

  const urlPath = request.url.split("?")[0] ?? request.url;
  if (PUBLIC_PATHS.has(urlPath)) return;

  // 정적 파일 (대시보드 HTML/JS/CSS)은 공개
  if (
    !urlPath.startsWith("/api/") &&
    (urlPath === "/" || urlPath.endsWith(".html") || urlPath.endsWith(".css") || urlPath.endsWith(".js"))
  ) {
    return;
  }

  const key = String(
    request.headers["x-api-key"] ??
      request.headers.authorization?.replace(/^Bearer\s+/i, "") ??
      "",
  )
    .trim()
    .replace(/^["']|["']$/g, "");

  if (key !== config.apiKey) {
    await reply.status(401).send({ error: "유효하지 않은 API 키입니다." });
    return;
  }
}
