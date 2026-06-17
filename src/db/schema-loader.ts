import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

/** schema.sql을 개별 SQL 문으로 분리 (-- 주석 제거) */
export function loadSchemaStatements(): string[] {
  const schemaPath = path.join(config.dataDir, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  return schema
    .split(";")
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}
