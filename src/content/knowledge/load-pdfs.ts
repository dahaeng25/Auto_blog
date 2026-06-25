import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "../../../config/index.js";

const require = createRequire(import.meta.url);
// index.js는 require 시 테스트 PDF를 읽어 ENOENT를 유발하므로 lib 직접 로드
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buffer: Buffer,
) => Promise<{ text?: string }>;

export interface PdfDocument {
  sourceFile: string;
  text: string;
}

interface CacheEntry {
  mtimeMs: number;
  text: string;
}

let memoryCache: PdfDocument[] | null = null;

function cachePathFor(pdfPath: string): string {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(config.knowledgeCacheDir, `${base}.json`);
}

async function readCache(
  pdfPath: string,
  stat: { mtimeMs: number },
): Promise<string | null> {
  try {
    const raw = await fs.readFile(cachePathFor(pdfPath), "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.mtimeMs === stat.mtimeMs && entry.text) {
      return entry.text;
    }
  } catch {
    // cache miss
  }
  return null;
}

async function writeCache(
  pdfPath: string,
  stat: { mtimeMs: number },
  text: string,
): Promise<void> {
  await fs.mkdir(config.knowledgeCacheDir, { recursive: true });
  const entry: CacheEntry = { mtimeMs: stat.mtimeMs, text };
  await fs.writeFile(cachePathFor(pdfPath), JSON.stringify(entry), "utf-8");
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const stat = await fs.stat(pdfPath);
  const cached = await readCache(pdfPath, stat);
  if (cached !== null) return cached;

  const buffer = await fs.readFile(pdfPath);
  const result = await pdfParse(buffer);
  const text = result.text?.trim() ?? "";
  await writeCache(pdfPath, stat, text);
  return text;
}

async function listPdfFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * knowledge/ 폴더의 PDF를 스캔하고 텍스트를 추출합니다 (디스크·메모리 캐시).
 */
export async function loadPdfs(forceReload = false): Promise<PdfDocument[]> {
  if (!forceReload && memoryCache !== null) {
    return memoryCache;
  }

  const pdfPaths = await listPdfFiles(config.knowledgeDir);
  if (pdfPaths.length === 0) {
    memoryCache = [];
    return [];
  }

  const documents: PdfDocument[] = [];

  for (const pdfPath of pdfPaths) {
    try {
      const text = await extractPdfText(pdfPath);
      if (!text) {
        console.warn(
          `[Knowledge] 텍스트 없음 — ${path.basename(pdfPath)}`,
        );
        continue;
      }
      documents.push({
        sourceFile: path.basename(pdfPath),
        text,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Knowledge] PDF 추출 실패 — ${path.basename(pdfPath)}: ${msg}`,
      );
    }
  }

  memoryCache = documents;
  return documents;
}

/** 테스트·재로드용 */
export function clearPdfMemoryCache(): void {
  memoryCache = null;
}
