import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Vercel — 항상 최신 public/index.html 서빙 (구버전 캐시 방지) */
export default function handler(
  _req: VercelRequest,
  res: VercelResponse,
): void {
  const htmlPath = path.join(process.cwd(), "public", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.status(200).send(html);
}
