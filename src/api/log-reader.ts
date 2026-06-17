import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

/**
 * 오늘 및 어제 로그 파일에서 최근 N줄을 반환합니다.
 * Vercel에서는 Vercel 대시보드 → Logs에서 확인하세요.
 */
export function readRecentLogs(maxLines = 200): string[] {
  if (config.isVercel) {
    return [
      "[INFO] Vercel 서버리스 환경에서는 파일 로그가 저장되지 않습니다.",
      "[INFO] Vercel 프로젝트 → Deployments → Functions → Logs에서 실행 로그를 확인하세요.",
    ];
  }
  const logsDir = path.join(config.outputDir, "logs");
  if (!fs.existsSync(logsDir)) return [];

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const files = [today, yesterday]
    .map((d) => path.join(logsDir, `${d}.log`))
    .filter((f) => fs.existsSync(f));

  const lines: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    lines.push(...content.split("\n").filter(Boolean));
  }

  return lines.slice(-maxLines);
}
