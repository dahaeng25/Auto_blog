import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isServerless } from "../browser/is-serverless.js";
import { launchChromium } from "../browser/launch-chromium.js";
import { launchPuppeteer } from "../browser/launch-puppeteer.js";
import { createScreenshotPage } from "../browser/create-screenshot-page.js";
import { config } from "../../config/index.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
  type ThumbnailBrandConfig,
} from "./brand-config.js";
import { mutateImageHashBuffer } from "./image-hash-mutator.js";
import {
  applyThumbnailTemplate,
  injectThumbnailTemplateText,
} from "./thumbnail-page-scripts.js";
import { tryResolveUserThumbnailBackground } from "../storage/thumbnail-background-store.js";

const DEFAULT_FALLBACK_GRADIENT =
  "linear-gradient(145deg, #1a3a5c 0%, #2d6a9f 48%, #1e4d73 100%)";

export interface ThumbnailRenderOptions {
  /** 가운데 메인 제목 (2줄, \\n 구분) */
  text: string;
  /** 상단 알약 라벨 (주제 키워드) */
  topLabel?: string;
  keywords?: string[];
  keywordSlug?: string;
  subtitle?: string;
  outputFilename?: string;
}

function resolveBaseImage(brand: ThumbnailBrandConfig): string | null {
  if (brand.background.type === "image" && assetExists(brand.background.image)) {
    return resolveAssetPath(brand.background.image!);
  }
  return null;
}

function resolveRenderBrand(brand: ThumbnailBrandConfig): {
  brand: ThumbnailBrandConfig;
  baseImagePath: string | null;
} {
  const baseImagePath = resolveBaseImage(brand);
  if (baseImagePath) {
    return { brand, baseImagePath };
  }

  if (brand.background.type === "image") {
    console.warn(
      "[Thumbnail] assets/thumbnail/bg.png 없음 — 기본 그라데이션 배경으로 대체합니다.",
    );
    return {
      brand: {
        ...brand,
        background: {
          type: "gradient",
          gradient: brand.background.gradient ?? DEFAULT_FALLBACK_GRADIENT,
        },
      },
      baseImagePath: null,
    };
  }

  return { brand, baseImagePath: null };
}

/**
 * bg.png 고정 템플릿 + 상단 라벨·가운데 제목만 주입.
 */
export class ThumbnailRenderer {
  private readonly templatePath: string;

  constructor(templatePath: string = config.thumbnailTemplatePath) {
    this.templatePath = templatePath;
  }

  async render(options: ThumbnailRenderOptions): Promise<string> {
    const brand = loadThumbnailBrand();
    const userBg = await tryResolveUserThumbnailBackground();

    let renderBrand: ThumbnailBrandConfig;
    let baseImagePath: string | null;

    if (userBg?.kind === "image") {
      renderBrand = {
        ...brand,
        background: { type: "image", image: userBg.absolutePath },
      };
      baseImagePath = userBg.absolutePath;
      console.log(`[Thumbnail] 사용자 업로드 배경 사용: ${baseImagePath}`);
    } else if (userBg?.kind === "gradient") {
      renderBrand = {
        ...brand,
        background: { type: "gradient", gradient: userBg.gradient },
      };
      baseImagePath = null;
      console.log("[Thumbnail] 사용자 선택 샘플 그라데이션 배경 사용");
    } else {
      ({ brand: renderBrand, baseImagePath } = resolveRenderBrand(brand));
    }

    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(config.thumbnailsDir, filename);

    if (
      !baseImagePath &&
      renderBrand.background.type !== "gradient" &&
      renderBrand.background.type !== "color"
    ) {
      throw new Error(
        "썸네일 배경이 없습니다. 대시보드에서 배경을 업로드·선택하거나 assets/thumbnail/bg.png 를 확인하세요.",
      );
    }

    await fs.mkdir(config.thumbnailsDir, { recursive: true });

    const baseImageUrl = baseImagePath
      ? pathToFileURL(baseImagePath).href
      : null;

    const screenshot = isServerless()
      ? await this.renderScreenshotPuppeteer(options, renderBrand, baseImagePath, baseImageUrl)
      : await this.renderScreenshotPlaywright(options, renderBrand, baseImagePath, baseImageUrl);

    const mutated = await mutateImageHashBuffer(screenshot);
    await fs.writeFile(outputPath, mutated);
    console.log(`[Thumbnail] 저장 완료: ${outputPath}`);
    return outputPath;
  }

  private async renderScreenshotPuppeteer(
    options: ThumbnailRenderOptions,
    renderBrand: ThumbnailBrandConfig,
    baseImagePath: string | null,
    baseImageUrl: string | null,
  ): Promise<Buffer> {
    const browser = await launchPuppeteer();
    const page = await browser.newPage();

    try {
      await page.setViewport({
        width: renderBrand.canvas.width,
        height: renderBrand.canvas.height + 100,
        deviceScaleFactor: 2,
      });
      await page.goto(pathToFileURL(this.templatePath).href, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 300));

      await applyThumbnailTemplate(
        page,
        renderBrand,
        baseImagePath,
        baseImageUrl,
        "puppeteer",
      );
      await injectThumbnailTemplateText(page, options, renderBrand);

      const el = await page.$("#thumbnail-canvas");
      if (!el) {
        throw new Error("썸네일 캔버스 요소를 찾을 수 없습니다.");
      }
      return Buffer.from(await el.screenshot({ type: "png" }));
    } finally {
      await page.close().catch(() => {});
      await browser.close();
    }
  }

  private async renderScreenshotPlaywright(
    options: ThumbnailRenderOptions,
    renderBrand: ThumbnailBrandConfig,
    baseImagePath: string | null,
    baseImageUrl: string | null,
  ): Promise<Buffer> {
    const browser = await launchChromium({ headless: true });
    const { page, close: closePage } = await createScreenshotPage(browser, {
      viewport: {
        width: renderBrand.canvas.width,
        height: renderBrand.canvas.height + 100,
      },
      deviceScaleFactor: 2,
    });

    try {
      await page.goto(pathToFileURL(this.templatePath).href, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      await applyThumbnailTemplate(
        page,
        renderBrand,
        baseImagePath,
        baseImageUrl,
        "playwright",
      );
      await injectThumbnailTemplateText(page, options, renderBrand);

      const canvas = page.locator("#thumbnail-canvas");
      return canvas.screenshot({ type: "png" });
    } finally {
      await closePage();
      await browser.close();
    }
  }
}
