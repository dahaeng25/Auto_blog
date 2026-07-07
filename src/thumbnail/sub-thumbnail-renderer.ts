import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
} from "./brand-config.js";
import { parseH2SectionTitle } from "../publishing/images/keyword-slug.js";
import { mutateImageHashBuffer } from "./image-hash-mutator.js";

export interface SubThumbnailRenderOptions {
  /** 단락(h2) 소제목 — 번호·제목 분리 표시 */
  sectionTitle: string;
  /** 배경 이미지 절대 경로 (없으면 bg.png·그라데이션) */
  backgroundPath?: string | null;
  /** 저장 파일명 (예: D84외국인창업2.png) */
  outputFilename: string;
  phone?: string;
}

const TITLE_MAX_CHARS = 36;

function buildSectionLabels(sectionTitle: string): {
  number: string;
  title: string;
} {
  const parsed = parseH2SectionTitle(sectionTitle);
  const title = parsed.title.slice(0, TITLE_MAX_CHARS);
  return { number: parsed.number, title };
}

function resolveBaseImage(): string | null {
  const brand = loadThumbnailBrand();
  if (brand.background.type === "image" && assetExists(brand.background.image)) {
    return resolveAssetPath(brand.background.image!);
  }
  return null;
}

async function fitSectionTitleFont(page: Page, text: string, maxWidth: number): Promise<void> {
  await page.evaluate(
    ({ text: content, maxWidth: mw }) => {
      const el = document.getElementById("section-title");
      if (!el) return;

      let size = 44;
      const min = 26;
      el.textContent = content;
      el.style.fontSize = `${size}px`;

      while (size > min && el.scrollWidth > mw) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
    },
    { text, maxWidth },
  );
}

/**
 * 단락별 서브썸네일 (700×700) 렌더링.
 * 메인 썸네일(bg.png) + h2 번호·소제목, 우하단 전화번호.
 */
export class SubThumbnailRenderer {
  private readonly templatePath: string;
  private readonly size: number;

  constructor(
    templatePath: string = config.subThumbnailTemplatePath,
    size: number = config.subThumbnailSize,
  ) {
    this.templatePath = templatePath;
    this.size = size;
  }

  async render(options: SubThumbnailRenderOptions): Promise<string> {
    const browser = await launchChromium({ headless: true });
    try {
      return await this.renderWithBrowser(browser, options);
    } finally {
      await browser.close();
    }
  }

  /** 브라우저 1회 실행으로 여러 서브썸네일 렌더 (속도 개선) */
  async renderBatch(
    browser: Browser,
    items: SubThumbnailRenderOptions[],
  ): Promise<string[]> {
    const paths: string[] = [];
    for (let i = 0; i < items.length; i++) {
      paths.push(await this.renderWithBrowser(browser, items[i]!));
      console.log(`[SubThumbnail] ${i + 1}/${items.length}: ${items[i]!.outputFilename}`);
    }
    return paths;
  }

  private async renderWithBrowser(
    browser: Browser,
    options: SubThumbnailRenderOptions,
  ): Promise<string> {
    const outputPath = path.join(
      config.thumbnailsDir,
      options.outputFilename,
    );
    await fs.mkdir(config.thumbnailsDir, { recursive: true });

    const phone = options.phone ?? config.contactPhone;
    const { number, title } = buildSectionLabels(options.sectionTitle);
    const bgOpacity = config.subThumbnailBackgroundOpacity;
    const baseImagePath = resolveBaseImage();
    const baseUrl = baseImagePath ? pathToFileURL(baseImagePath).href : null;
    const bgUrl = options.backgroundPath
      ? pathToFileURL(options.backgroundPath).href
      : null;

    const context = await browser.newContext({
      viewport: { width: this.size, height: this.size + 50 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    try {
      await page.goto(pathToFileURL(this.templatePath).href, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);

      await page.evaluate(
        ({ size, phone, number, title, baseUrl, bgUrl, bgOpacity }) => {
          const canvas = document.getElementById("sub-canvas");
          const baseImg = document.getElementById("sub-bg-base") as HTMLImageElement | null;
          const bgImg = document.getElementById("sub-bg") as HTMLImageElement | null;
          const bgFallback = document.getElementById("bg-fallback");
          const numberWrap = document.getElementById("section-number-wrap");
          const numberEl = document.getElementById("section-number");
          const titleEl = document.getElementById("section-title");
          const phoneEl = document.getElementById("phone-text");

          if (canvas) {
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
          }
          if (titleEl) titleEl.textContent = title;
          if (phoneEl) phoneEl.textContent = phone;

          if (number && numberEl && numberWrap) {
            numberEl.textContent = number;
            numberWrap.style.display = "block";
          } else if (numberWrap) {
            numberWrap.style.display = "none";
          }

          if (baseUrl && baseImg) {
            baseImg.src = baseUrl;
            baseImg.style.display = "block";
          }

          if (bgUrl && bgImg) {
            bgImg.src = bgUrl;
            bgImg.style.display = "block";
            bgImg.style.opacity = String(bgOpacity);
            if (bgFallback) bgFallback.style.display = "none";
          } else if (!baseUrl && bgFallback) {
            bgFallback.style.display = "block";
          }
        },
        { size: this.size, phone, number, title, baseUrl, bgUrl, bgOpacity },
      );

      if (baseUrl) {
        await page.waitForFunction(
          () => {
            const img = document.getElementById("sub-bg-base") as HTMLImageElement | null;
            return Boolean(img?.complete && img.naturalWidth > 0);
          },
          undefined,
          { timeout: 15_000 },
        );
      }

      if (bgUrl) {
        await page.waitForFunction(
          () => {
            const img = document.getElementById("sub-bg") as HTMLImageElement | null;
            return Boolean(img?.complete && img.naturalWidth > 0);
          },
          undefined,
          { timeout: 15_000 },
        );
      }

      await fitSectionTitleFont(page, title, this.size * 0.86);

      const screenshot = await page.locator("#sub-canvas").screenshot({
        type: "png",
      });
      const mutated = await mutateImageHashBuffer(screenshot);
      await fs.writeFile(outputPath, mutated);

      console.log(`[SubThumbnail] 저장: ${outputPath}`);
      return outputPath;
    } finally {
      await context.close();
    }
  }
}
