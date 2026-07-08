import path from "node:path";
import { readLocalizedTextFileSync } from "../src/fs/read-localized-text-file.js";

const file = process.argv[2];
if (!file) {
  process.exit(1);
}

const content = readLocalizedTextFileSync(path.resolve(file));
const line = content
  .split(/\r?\n/)
  .map((l) => l.trim())
  .find((l) => l && !l.startsWith("#"));

if (line) {
  process.stdout.write(line);
}
