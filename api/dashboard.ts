import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function deployStamp(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 8) ||
    String(Date.now())
  );
}

/** Vercel — 항상 최신 public/index.html 서빙 + 배포별 캐시 버스팅 */
export default function handler(
  _req: VercelRequest,
  res: VercelResponse,
): void {
  const htmlPath = path.join(process.cwd(), "public", "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  const stamp = deployStamp();

  html = html
    .replace(/\/styles\.css\?v=[^"'\s]+/g, `/styles.css?v=${stamp}`)
    .replace(/\/dashboard\.js\?v=[^"'\s]+/g, `/dashboard.js?v=${stamp}`);

  if (!html.includes('id="deploy-stamp"')) {
    html = html.replace(
      '<p class="subtitle">클라우드 블로그 자동화 대시보드</p>',
      `<p class="subtitle">클라우드 블로그 자동화 대시보드 <span id="deploy-stamp" class="deploy-stamp">build ${stamp}</span></p>`,
    );
  } else {
    html = html.replace(
      /id="deploy-stamp"[^>]*>[^<]*/,
      `id="deploy-stamp" class="deploy-stamp">build ${stamp}`,
    );
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.status(200).send(html);
}
