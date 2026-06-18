import fs from "node:fs";
import path from "node:path";
import { config } from "../../config/index.js";

export interface ThumbnailBrandConfig {
  canvas: { width: number; height: number };
  background: {
    type: "image" | "gradient" | "color" | "dynamic";
    gradient?: string;
    color?: string;
    image?: string;
    overlay?: string;
  };
  frame?: {
    outerBorder?: string;
    innerBorder?: string;
  };
  header?: {
    enabled: boolean;
    /** 고정 로고·회사명 이미지 (변형 금지) */
    overlayImage?: string;
    overlayHeight?: string;
    logo?: string;
    companyName?: string;
    fontSize?: string;
    color?: string;
    top?: string;
  };
  footer?: {
    enabled: boolean;
    /** 고정 푸터 문구 이미지 */
    overlayImage?: string;
    overlayHeight?: string;
    text?: string;
    fontSize?: string;
    color?: string;
    bottom?: string;
    right?: string;
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
    type: "dynamic",
    overlay: "rgba(0,0,0,0.28)",
  },
  frame: {
    outerBorder: "18px solid #1c1c1c",
    innerBorder: "3px solid #c9a227",
  },
  header: {
    enabled: true,
    overlayImage: "assets/thumbnail/header-banner.png",
    overlayHeight: "118px",
    companyName: "주식회사 청사 디렉터스",
    fontSize: "22px",
    color: "#ffffff",
    top: "18px",
  },
  footer: {
    enabled: true,
    overlayImage: "assets/thumbnail/footer-banner.png",
    overlayHeight: "68px",
    text: "브랜드 마케팅",
    fontSize: "18px",
    color: "rgba(255,255,255,0.9)",
    bottom: "18px",
    right: "36px",
  },
  text: {
    fontFamily: "'Nanum Gothic', 'Malgun Gothic', sans-serif",
    fontWeight: "800",
    color: "#ffffff",
    align: "center",
    verticalAlign: "center",
    lineHeight: 1.35,
    letterSpacing: "-0.5px",
    textShadow: "0 2px 12px rgba(0,0,0,0.45)",
    padding: "120px 64px 100px",
    maxWidth: "780px",
    fontSizeMin: 44,
    fontSizeMax: 58,
  },
  subtitle: { enabled: false, fontSize: "20px", color: "rgba(255,255,255,0.75)" },
  logo: { enabled: false, width: 140, top: 40, left: 40 },
  decor: {
    topBar: { enabled: false, height: 10, color: "#c9a227" },
    bottomBar: { enabled: false, height: 10, color: "#c9a227" },
    textBox: { enabled: false, border: "", padding: "" },
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
  const defaultDecor = DEFAULT_BRAND.decor!;
  const topBar = raw.decor?.topBar;
  const bottomBar = raw.decor?.bottomBar;
  const textBox = raw.decor?.textBox;

  return {
    ...DEFAULT_BRAND,
    ...raw,
    background: { ...DEFAULT_BRAND.background, ...raw.background },
    frame: { ...DEFAULT_BRAND.frame, ...raw.frame },
    header: { ...DEFAULT_BRAND.header, ...raw.header },
    footer: { ...DEFAULT_BRAND.footer, ...raw.footer },
    text: { ...DEFAULT_BRAND.text, ...raw.text },
    decor: {
      topBar: {
        enabled: topBar?.enabled ?? defaultDecor.topBar!.enabled,
        height: topBar?.height ?? defaultDecor.topBar!.height,
        color: topBar?.color ?? defaultDecor.topBar!.color,
      },
      bottomBar: {
        enabled: bottomBar?.enabled ?? defaultDecor.bottomBar!.enabled,
        height: bottomBar?.height ?? defaultDecor.bottomBar!.height,
        color: bottomBar?.color ?? defaultDecor.bottomBar!.color,
      },
      textBox: {
        enabled: textBox?.enabled ?? defaultDecor.textBox!.enabled,
        border: textBox?.border ?? defaultDecor.textBox!.border,
        padding: textBox?.padding ?? defaultDecor.textBox!.padding,
        ...(textBox?.background !== undefined
          ? { background: textBox.background }
          : {}),
      },
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
