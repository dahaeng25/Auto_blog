import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

export interface ThumbnailBrandConfig {
  canvas: { width: number; height: number };
  background: {
    type: "image" | "gradient" | "color";
    gradient?: string;
    color?: string;
    image?: string;
  };
  text: {
    fontFamily: string;
    fontWeight: string;
    color: string;
    align: string;
    verticalAlign: string;
    lineHeight: number;
    letterSpacing: string;
    textShadow: string;
    padding: string;
    maxWidth: string;
    fontSizeMin?: number;
    fontSizeMax?: number;
  };
  subtitle: {
    enabled: boolean;
    fontSize: string;
    color: string;
  };
  logo: {
    enabled: boolean;
    image?: string;
    width: number;
    top: number;
    left: number;
  };
  decor?: {
    topBar?: { enabled: boolean; height: number; color: string };
    bottomBar?: { enabled: boolean; height: number; color: string };
    textBox?: {
      enabled: boolean;
      border: string;
      padding: string;
      background?: string;
    };
  };
  accent: {
    enabled: boolean;
    height: number;
    gradient: string;
  };
}

const DEFAULT_BRAND: ThumbnailBrandConfig = {
  canvas: { width: 886, height: 886 },
  background: {
    type: "gradient",
    gradient: "linear-gradient(165deg, #0c2540 0%, #1a4a7a 45%, #0f3258 100%)",
  },
  text: {
    fontFamily: "'Nanum Gothic', 'Malgun Gothic', sans-serif",
    fontWeight: "800",
    color: "#ffffff",
    align: "center",
    verticalAlign: "center",
    lineHeight: 1.45,
    letterSpacing: "-0.5px",
    textShadow: "0 2px 8px rgba(0,0,0,0.25)",
    padding: "100px 72px",
    maxWidth: "760px",
    fontSizeMin: 34,
    fontSizeMax: 52,
  },
  subtitle: { enabled: false, fontSize: "20px", color: "rgba(255,255,255,0.75)" },
  logo: { enabled: false, width: 140, top: 40, left: 40 },
  decor: {
    topBar: { enabled: true, height: 10, color: "#c9a227" },
    bottomBar: { enabled: true, height: 10, color: "#c9a227" },
    textBox: {
      enabled: true,
      border: "2px solid rgba(201,162,39,0.55)",
      padding: "28px 36px",
      background: "rgba(12,37,64,0.35)",
    },
  },
  accent: { enabled: false, height: 6, gradient: "linear-gradient(90deg, #c9a227, #e8c547)" },
};

/** brand.json 로드 — 없으면 기본값 */
export function loadThumbnailBrand(): ThumbnailBrandConfig {
  const brandPath = path.resolve(config.thumbnailBrandPath);

  if (!fs.existsSync(brandPath)) {
    return DEFAULT_BRAND;
  }

  const raw = JSON.parse(fs.readFileSync(brandPath, "utf-8")) as Partial<ThumbnailBrandConfig>;
  return {
    ...DEFAULT_BRAND,
    ...raw,
    text: { ...DEFAULT_BRAND.text, ...raw.text },
    decor: {
      topBar: { ...DEFAULT_BRAND.decor?.topBar, ...raw.decor?.topBar },
      bottomBar: { ...DEFAULT_BRAND.decor?.bottomBar, ...raw.decor?.bottomBar },
      textBox: { ...DEFAULT_BRAND.decor?.textBox, ...raw.decor?.textBox },
    },
  };
}

/** 프로젝트 루트 기준 에셋 절대 경로 */
export function resolveAssetPath(relativePath: string): string {
  return path.resolve(config.projectRoot, relativePath);
}

/** 파일 존재 여부 */
export function assetExists(relativePath?: string): boolean {
  if (!relativePath) return false;
  return fs.existsSync(resolveAssetPath(relativePath));
}
