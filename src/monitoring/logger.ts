import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

type LogLevel = "INFO" | "WARN" | "ERROR";

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${timestamp()}] [${level}] ${message}`;
}

function appendToFile(line: string): void {
  try {
    const logsDir = path.join(config.outputDir, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(
      logsDir,
      `${new Date().toISOString().slice(0, 10)}.log`,
    );
    fs.appendFileSync(logFile, line + "\n", "utf-8");
  } catch {
    // 파일 로깅 실패는 무시
  }
}

function log(level: LogLevel, message: string): void {
  const line = formatMessage(level, message);
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
  appendToFile(line);
}

export const logger = {
  info: (message: string) => log("INFO", message),
  warn: (message: string) => log("WARN", message),
  error: (message: string) => log("ERROR", message),
};
