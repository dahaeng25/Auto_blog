import fs from "node:fs";
import path from "node:path";
import { decodeLocalizedBuffer } from "../src/fs/read-localized-text-file.js";

const target = process.argv[2];
const source = process.argv[3];

if (!target || !source) {
  process.exit(1);
}

let value = "";
try {
  const buf = fs.readFileSync(path.resolve(source));
  value = decodeLocalizedBuffer(buf).trim();
} catch {
  value = (process.argv[4] ?? "").trim();
}

if (!value && process.argv[4]) {
  value = process.argv[4].trim();
}

fs.writeFileSync(path.resolve(target), `${value}\n`, "utf8");
