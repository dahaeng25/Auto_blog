import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import { generateThumbnailBackground } from "./background-generator.js";
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
): Promise<void> {
  const photoUrl = photoPath ? pathToFileURL(photoPath).href : null;
  const headerLogoUrl =
    brand.header?.enabled &&
    brand.header.logo &&
    assetExists(brand.header.logo)
      ? pathToFileURL(resolveAssetPath(brand.header.logo)).href
      : null;

  await page.evaluate(
    ({ brand: b, photoUrl: bgUrl, headerLogoUrl: logoUrl }) => {
      const canvas = document.getElementById("thumbnail-canvas");
      const photo = document.getElementById("thumbnail-photo");
      const overlay = document.getElementById("thumbnail-overlay");
      const frameInner = document.getElementById("thumbnail-frame-inner");
      const header = document.getElementById("thumbnail-header");
      const headerLogo = document.getElementById(
        "thumbnail-header-logo",
      ) as HTMLImageElement | null;
      const companyName = document.getElementById("thumbnail-company-name");
      const footer = document.getElementById("thumbnail-footer");
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

      if (header && b.header?.enabled) {
        header.style.display = "flex";
        if (b.header.top) header.style.top = b.header.top;

        if (headerLogo && logoUrl) {
          headerLogo.src = logoUrl;
          headerLogo.style.display = "block";
        }

        if (companyName && b.header.companyName) {
          companyName.textContent = b.header.companyName;
          companyName.style.fontSize = b.header.fontSize ?? "22px";
          companyName.style.color = b.header.color ?? "#ffffff";
        }
      }

      if (footer && b.footer?.enabled && b.footer.text) {
        footer.textContent = b.footer.text;
        footer.style.display = "block";
        footer.style.fontSize = b.footer.fontSize ?? "18px";
        footer.style.color = b.footer.color ?? "rgba(255,255,255,0.9)";
        footer.style.bottom = b.footer.bottom ?? "28px";
        footer.style.right = b.footer.right ?? "36px";
      }
    },
    { brand, photoUrl, headerLogoUrl },
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

      await applyBrandDesign(page, brand, photoPath);
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
