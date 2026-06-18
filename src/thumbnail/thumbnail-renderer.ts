import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import { generateThumbnailBackground } from "./background-generator.js";
import { ensureBrandOverlayAssets } from "./brand-overlay.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
  type ThumbnailBrandConfig,
} from "./brand-config.js";

export interface ThumbnailRenderOptions {
  /** 매번 바뀌는 메인 문구 (Gems/thumbnailText) */
  text: string;
  /** 메인 키워드 — 배경 이미지 생성에 사용 */
  keywords?: string[];
  /** 키워드 파일명 접두사 */
  keywordSlug?: string;
  subtitle?: string;
  outputFilename?: string;
}

function calcFontSize(text: string, brand: ThumbnailBrandConfig): number {
  const min = brand.text.fontSizeMin ?? 44;
  const max = brand.text.fontSizeMax ?? 58;
  const len = text.replace(/\s/g, "").length;

  if (len <= 10) return max;
  if (len <= 16) return Math.round(max * 0.92);
  if (len <= 24) return Math.round(max * 0.84);
  if (len <= 32) return Math.round(max * 0.76);
  return min;
}

async function resolvePhotoPath(
  options: ThumbnailRenderOptions,
  brand: ThumbnailBrandConfig,
): Promise<string | null> {
  const keywords = options.keywords?.filter(Boolean) ?? [];
  const slug = options.keywordSlug ?? "thumbnail";

  if (
    brand.background.type === "dynamic" &&
    config.thumbnailDynamicBackground &&
    keywords.length > 0
  ) {
    return generateThumbnailBackground(keywords, slug);
  }

  if (brand.background.type === "image" && assetExists(brand.background.image)) {
    return resolveAssetPath(brand.background.image!);
  }

  return null;
}

async function applyBrandDesign(
  page: Page,
  brand: ThumbnailBrandConfig,
  photoPath: string | null,
  overlays: { headerPath: string | null; footerPath: string | null },
): Promise<void> {
  const photoUrl = photoPath ? pathToFileURL(photoPath).href : null;

  const headerOverlayUrl =
    overlays.headerPath && brand.header?.enabled
      ? pathToFileURL(overlays.headerPath).href
      : null;
  const footerOverlayUrl =
    overlays.footerPath && brand.footer?.enabled
      ? pathToFileURL(overlays.footerPath).href
      : null;

  await page.evaluate(
    ({ brand: b, photoUrl: bgUrl, headerUrl, footerUrl }) => {
      const canvas = document.getElementById("thumbnail-canvas");
      const photo = document.getElementById("thumbnail-photo");
      const overlay = document.getElementById("thumbnail-overlay");
      const frameInner = document.getElementById("thumbnail-frame-inner");
      const headerOverlay = document.getElementById(
        "thumbnail-header-overlay",
      ) as HTMLImageElement | null;
      const footerOverlay = document.getElementById(
        "thumbnail-footer-overlay",
      ) as HTMLImageElement | null;
      const textArea = document.getElementById("text-area");
      const mainEl = document.getElementById("thumbnail-text");

      if (!canvas || !photo || !textArea) return;

      canvas.style.width = `${b.canvas.width}px`;
      canvas.style.height = `${b.canvas.height}px`;

      if (b.frame?.outerBorder) {
        canvas.style.border = b.frame.outerBorder;
      }

      if (frameInner && b.frame?.innerBorder) {
        frameInner.style.border = b.frame.innerBorder;
        frameInner.style.display = "block";
      }

      if (bgUrl) {
        photo.style.backgroundImage = `url(${bgUrl})`;
      } else if (b.background.type === "gradient" && b.background.gradient) {
        photo.style.background = b.background.gradient;
      } else if (b.background.color) {
        photo.style.background = b.background.color;
      } else {
        photo.style.background =
          "linear-gradient(165deg, #0c2540 0%, #1a4a7a 45%, #0f3258 100%)";
      }

      if (overlay && b.background.overlay) {
        overlay.style.background = b.background.overlay;
      }

      textArea.style.alignItems =
        b.text.align === "center" ? "center" : "flex-start";
      textArea.style.justifyContent =
        b.text.verticalAlign === "center" ? "center" : "flex-end";
      textArea.style.textAlign = b.text.align;
      textArea.style.padding = b.text.padding;

      if (mainEl) {
        mainEl.style.fontFamily = b.text.fontFamily;
        mainEl.style.fontWeight = b.text.fontWeight;
        mainEl.style.color = b.text.color;
        mainEl.style.lineHeight = String(b.text.lineHeight);
        mainEl.style.letterSpacing = b.text.letterSpacing;
        mainEl.style.textShadow = b.text.textShadow;
        mainEl.style.maxWidth = b.text.maxWidth;
      }

      if (headerOverlay && headerUrl) {
        headerOverlay.src = headerUrl;
        headerOverlay.style.display = "block";
        headerOverlay.style.height = b.header?.overlayHeight ?? "118px";
      }

      if (footerOverlay && footerUrl) {
        footerOverlay.src = footerUrl;
        footerOverlay.style.display = "block";
        footerOverlay.style.height = b.footer?.overlayHeight ?? "68px";
      }
    },
    {
      brand,
      photoUrl,
      headerUrl: headerOverlayUrl,
      footerUrl: footerOverlayUrl,
    },
  );
}

async function injectText(
  page: Page,
  options: ThumbnailRenderOptions,
  brand: ThumbnailBrandConfig,
): Promise<void> {
  const fontSize = calcFontSize(options.text, brand);
  const showSubtitle =
    brand.subtitle.enabled &&
    config.thumbnailShowSubtitle &&
    Boolean(options.subtitle);

  await page.evaluate(
    ({ text, subtitle, fontSize: size, showSub, subStyle }) => {
      const mainEl = document.getElementById("thumbnail-text");
      const subEl = document.getElementById("thumbnail-subtitle");
      if (!mainEl) throw new Error("#thumbnail-text 없음");

      mainEl.textContent = text;
      mainEl.style.fontSize = `${size}px`;

      if (subEl) {
        if (showSub && subtitle) {
          subEl.textContent = subtitle;
          subEl.style.display = "block";
          subEl.style.fontSize = subStyle.fontSize;
          subEl.style.color = subStyle.color;
          subEl.style.marginTop = "16px";
        } else {
          subEl.style.display = "none";
        }
      }
    },
    {
      text: options.text,
      subtitle: options.subtitle ?? "",
      fontSize,
      showSub: showSubtitle,
      subStyle: brand.subtitle,
    },
  );
}

/**
 * 고정 프레임(로고·테두리) + 키워드별 AI 배경 + 썸네일 문구로 PNG 생성.
 */
export class ThumbnailRenderer {
  private readonly templatePath: string;

  constructor(templatePath: string = config.thumbnailTemplatePath) {
    this.templatePath = templatePath;
  }

  async render(options: ThumbnailRenderOptions): Promise<string> {
    const brand = loadThumbnailBrand();
    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(config.thumbnailsDir, filename);

    await fs.mkdir(config.thumbnailsDir, { recursive: true });

    const photoPath = await resolvePhotoPath(options, brand);
    const overlays = await ensureBrandOverlayAssets();

    const browser = await launchChromium({ headless: true });
    const context = await browser.newContext({
      viewport: { width: brand.canvas.width, height: brand.canvas.height + 100 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    try {
      await page.goto(pathToFileURL(this.templatePath).href, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      await applyBrandDesign(page, brand, photoPath, overlays);
      await injectText(page, options, brand);

      const canvas = page.locator("#thumbnail-canvas");
      await canvas.screenshot({ path: outputPath, type: "png" });

      console.log(`[Thumbnail] 저장 완료: ${outputPath}`);
      return outputPath;
    } finally {
      await context.close();
      await browser.close();
    }
  }
}
