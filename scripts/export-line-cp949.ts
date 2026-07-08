import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readLocalizedTextFileSync } from "../src/fs/read-localized-text-file.js";

const source = process.argv[2];
const target = process.argv[3];

if (!source || !target) {
  process.exit(1);
}

const content = readLocalizedTextFileSync(path.resolve(source));
const line =
  content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#")) ?? "";

const absTarget = path.resolve(target);
const escapedPath = absTarget.replace(/'/g, "''");
const escapedLine = line.replace(/'/g, "''");

const ps = `[IO.File]::WriteAllText('${escapedPath}', '${escapedLine}', [Text.Encoding]::GetEncoding(949))`;
execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {
  stdio: "ignore",
});
