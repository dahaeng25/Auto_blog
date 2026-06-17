import fs from "node:fs";
import path from "node:path";
import { config } from "../../../config/index.js";

export interface BodyImageEntry {
  id: string;
  file: string;
  linkUrl?: string;
}

interface ImageManifestFile {
  bodyImages: BodyImageEntry[];
}

export interface ResolvedBodyImage {
  id: string;
  absolutePath: string;
  linkUrl?: string;
}

function loadManifestRaw(): ImageManifestFile {
  const manifestPath = path.resolve(config.imageManifestPath);

  if (!fs.existsSync(manifestPath)) {
    return { bodyImages: [] };
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ImageManifestFile;
}

/** manifest에 정의된 본문 이미지 중 실제 파일이 있는 것만 반환 */
export function loadBodyImages(): ResolvedBodyImage[] {
  const raw = loadManifestRaw();
  const resolved: ResolvedBodyImage[] = [];

  for (const entry of raw.bodyImages ?? []) {
    const absolutePath = path.resolve(config.projectRoot, entry.file);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[BodyImage] 파일 없음 — 건너뜀: ${entry.file}`);
      continue;
    }

    resolved.push({
      id: entry.id,
      absolutePath,
      linkUrl: entry.linkUrl?.trim() || undefined,
    });
  }

  return resolved;
}
