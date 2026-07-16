import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED: Record<string, string> = {
  "dashboard.js": "application/javascript; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
};

/** Vercel — public 정적 파일 폴백 (dashboard.js, styles.css) */
export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): void {
  const raw = req.query.name;
  const name = Array.isArray(raw) ? raw[0] : raw;
  const contentType = name ? ALLOWED[name] : undefined;

  if (!name || !contentType) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    return;
  }

  const filePath = path.join(process.cwd(), "public", name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    return;
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.status(200).send(fs.readFileSync(filePath));
}
