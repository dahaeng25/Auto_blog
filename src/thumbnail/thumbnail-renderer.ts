import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { config } from "../../config/index.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
  type ThumbnailBrandConfig,
} from "./brand-config.js";

export interface ThumbnailRenderOptions {
  /** 매번 바뀌는 메인 문구 (Gems/thumbnailText 에이전트) */
  text: string;
  /** 부제목 — brand.json subtitle.enabled=true 일 때만 표시 */
  subtitle?: string;
  outputFilename?: string;
}

function calcFontSize(text: string, brand: ThumbnailBrandConfig): number {
  const min = brand.text.fontSizeMin ?? 32;
  const max = brand.text.fontSizeMax ?? 64;
  const len = text.replace(/\s/g, "").length;

  if (len <= 8) return max;
  if (len <= 14) return Math.round(max * 0.88);
  if (len <= 20) return Math.round(max * 0.76);
  if (len <= 28) return Math.round(max * 0.66);
  return min;
}

/** brand.json 디자인을 캔버스에 적용 (고정) */
async function applyBrandDesign(
  page: Page,
  brand: ThumbnailBrandConfig,
): Promise<void> {
  const bgImage =
    brand.background.type === "image" && assetExists(brand.background.image)
      ? pathToFileURL(resolveAssetPath(brand.background.image!)).href
      : null;

  const logoImage =
    brand.logo.enabled && assetExists(brand.logo.image)
      ? pathToFileURL(resolveAssetPath(brand.logo.image!)).href
      : null;

  await page.evaluate(
    ({ brand: b, bgUrl, logoUrl }) => {
      const canvas = document.getElementById("thumbnail-canvas");
      const bg = document.getElementById("thumbnail-bg");
      const logo = document.getElementById("thumbnail-logo") as HTMLImageElement | null;
      const textArea = document.getElementById("text-area");
      const accent = document.getElementById("thumbnail-accent");
      const topBar = document.getElementById("thumbnail-top-bar");
      const bottomBar = document.getElementById("thumbnail-bottom-bar");
      const textBox = document.getElementById("thumbnail-text-box");

      if (!canvas || !bg || !textArea) return;

      canvas.style.width = `${b.canvas.width}px`;
      canvas.style.height = `${b.canvas.height}px`;

      if (bgUrl) {
        bg.style.backgroundImage = `url(${bgUrl})`;
        bg.style.background = `url(${bgUrl}) center/cover no-repeat`;
      } else if (b.background.type === "gradient" && b.background.gradient) {
        bg.style.background = b.background.gradient;
      } else if (b.background.color) {
        bg.style.background = b.background.color;
      }

      textArea.style.alignItems =
        b.text.align === "center" ? "center" : "flex-start";
      textArea.style.justifyContent =
        b.text.verticalAlign === "center" ? "center" : "flex-end";
      textArea.style.textAlign = b.text.align;
      textArea.style.padding = b.text.padding;

      const mainEl = document.getElementById("thumbnail-text");
      if (mainEl) {
        mainEl.style.fontFamily = b.text.fontFamily;
        mainEl.style.fontWeight = b.text.fontWeight;
        mainEl.style.color = b.text.color;
        mainEl.style.lineHeight = String(b.text.lineHeight);
        mainEl.style.letterSpacing = b.text.letterSpacing;
        mainEl.style.textShadow = b.text.textShadow;
        mainEl.style.maxWidth = b.text.maxWidth;
      }

      if (logo && logoUrl) {
        logo.src = logoUrl;
        logo.style.display = "block";
        logo.style.width = `${b.logo.width}px`;
        logo.style.top = `${b.logo.top}px`;
        logo.style.left = `${b.logo.left}px`;
      }

      if (accent && b.accent.enabled) {
        accent.style.display = "block";
        accent.style.height = `${b.accent.height}px`;
        accent.style.background = b.accent.gradient;
      }

      if (topBar && b.decor?.topBar?.enabled) {
        topBar.style.display = "block";
        topBar.style.height = `${b.decor.topBar.height}px`;
        topBar.style.background = b.decor.topBar.color;
      }

      if (bottomBar && b.decor?.bottomBar?.enabled) {
        bottomBar.style.display = "block";
        bottomBar.style.height = `${b.decor.bottomBar.height}px`;
        bottomBar.style.background = b.decor.bottomBar.color;
      }

      if (textBox && b.decor?.textBox?.enabled) {
        textBox.style.border = b.decor.textBox.border;
        textBox.style.padding = b.decor.textBox.padding;
        if (b.decor.textBox.background) {
          textBox.style.background = b.decor.textBox.background;
        }
      }
    },
    { brand, bgUrl: bgImage, logoUrl: logoImage },
  );
}

/** 매번 바뀌는 문구만 주입 */
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
 * 브랜드 템플릿(고정) + thumbnailText(가변)로 썸네일 PNG 생성.
 */
export class ThumbnailRenderer {
  private readonly templatePath: string;
  private readonly outputDir: string;

  constructor(
    templatePath: string = config.thumbnailTemplatePath,
    outputDir: string = config.thumbnailsDir,
  ) {
    this.templatePath = templatePath;
    this.outputDir = outputDir;
  }

  async render(options: ThumbnailRenderOptions): Promise<string> {
    const brand = loadThumbnailBrand();
    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
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

      await applyBrandDesign(page, brand);
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
