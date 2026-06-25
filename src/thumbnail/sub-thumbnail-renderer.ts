import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import { mutateImageHashBuffer } from "./image-hash-mutator.js";

export interface SubThumbnailRenderOptions {
  /** 단락(h2) 소제목 — 중앙 표시 */
  sectionTitle: string;
  /** 배경 이미지 절대 경로 (없으면 그라데이션) */
  backgroundPath?: string | null;
  /** 저장 파일명 (예: D84외국인창업2.png) */
  outputFilename: string;
  phone?: string;
}

function buildCenterLabel(sectionTitle: string): string {
  return sectionTitle.trim().slice(0, 32);
}

/**
 * 단락별 서브썸네일 (700×700) 렌더링.
 * 중앙 단락명칭, 우하단 전화번호.
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
    const centerLabel = buildCenterLabel(options.sectionTitle);
    const bgOpacity = config.subThumbnailBackgroundOpacity;
    const textBgOpacity = config.subThumbnailTextBackgroundOpacity;
    const bgUrl = options.backgroundPath
      ? pathToFileURL(options.backgroundPath).href
      : null;

    const context = await browser.newContext({
      viewport: { width: this.size, height: this.size + 50 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
      await page.goto(pathToFileURL(this.templatePath).href, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);

      await page.evaluate(
        ({ size, phone, centerLabel, bgUrl, bgOpacity, textBgOpacity }) => {
          const canvas = document.getElementById("sub-canvas");
          const bgImg = document.getElementById("sub-bg") as HTMLImageElement | null;
          const bgFallback = document.getElementById("bg-fallback");
          const centerBox = document.getElementById("center-box");
          const centerEl = document.getElementById("center-text");
          const phoneBox = document.getElementById("phone-box");
          const phoneEl = document.getElementById("phone-text");

          if (canvas) {
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
          }
          if (centerEl) centerEl.textContent = centerLabel;
          if (phoneEl) phoneEl.textContent = phone;

          if (centerBox) {
            centerBox.style.background = `rgba(0, 0, 0, ${textBgOpacity})`;
          }
          if (phoneBox) {
            phoneBox.style.background = `rgba(0, 0, 0, ${textBgOpacity})`;
          }

          if (bgUrl && bgImg) {
            bgImg.src = bgUrl;
            bgImg.style.display = "block";
            bgImg.style.opacity = String(bgOpacity);
            if (bgFallback) bgFallback.style.display = "none";
          } else if (bgFallback) {
            bgFallback.style.display = "block";
          }
        },
        { size: this.size, phone, centerLabel, bgUrl, bgOpacity, textBgOpacity },
      );

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
