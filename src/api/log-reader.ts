import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

/**
 * 오늘 및 어제 로그 파일에서 최근 N줄을 반환합니다.
 * Vercel에서는 Vercel 대시보드 → Logs에서 확인하세요.
 */
export function readRecentLogs(maxLines = 200): string[] {
  const logsDir = path.join(config.outputDir, "logs");
  if (!fs.existsSync(logsDir)) {
    if (config.isVercel) {
      return [
        "[INFO] 아직 실행 로그가 없습니다. 파이프라인 실행 후 다시 확인하세요.",
        "[INFO] 상세 로그: Vercel → Deployments → Functions → Logs",
      ];
    }
    return [];
  }

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
