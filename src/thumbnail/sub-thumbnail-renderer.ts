import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";

export interface SubThumbnailRenderOptions {
  /** 단락(h2) 소제목 — 우측하단 업무명 */
  sectionTitle: string;
  /** 배경 이미지 절대 경로 (없으면 그라데이션) */
  backgroundPath?: string | null;
  /** 저장 파일명 (예: D84외국인창업2.png) */
  outputFilename: string;
  phone?: string;
}

function buildAttribution(sectionTitle: string): string {
  const title = sectionTitle.trim().slice(0, 28);
  return `${title} 강운준행정사`;
}

/**
 * 단락별 서브썸네일 (700×700) 렌더링.
 * 배경 60~70% 투명도, 중앙 연락처, 우하단 업무명+행정사.
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
    const outputPath = path.join(
      config.thumbnailsDir,
      options.outputFilename,
    );
    await fs.mkdir(config.thumbnailsDir, { recursive: true });

    const phone = options.phone ?? config.contactPhone;
    const attribution = buildAttribution(options.sectionTitle);
    const bgOpacity = config.subThumbnailBackgroundOpacity;
    const textBgOpacity = config.subThumbnailTextBackgroundOpacity;
    const bgUrl = options.backgroundPath
      ? pathToFileURL(options.backgroundPath).href
      : null;

    const browser = await launchChromium({ headless: true });
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
        ({ size, phone, attribution, bgUrl, bgOpacity, textBgOpacity }) => {
          const canvas = document.getElementById("sub-canvas");
          const bgImg = document.getElementById("sub-bg") as HTMLImageElement | null;
          const bgFallback = document.getElementById("bg-fallback");
          const phoneBox = document.getElementById("phone-box");
          const phoneEl = document.getElementById("phone-text");
          const attrEl = document.getElementById("attribution");

          if (canvas) {
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
          }
          if (phoneEl) phoneEl.textContent = phone;
          if (attrEl) attrEl.textContent = attribution;

          if (phoneBox) {
            phoneBox.style.background = `rgba(0, 0, 0, ${textBgOpacity})`;
          }
          if (attrEl) {
            attrEl.style.background = `rgba(0, 0, 0, ${textBgOpacity})`;
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
        { size: this.size, phone, attribution, bgUrl, bgOpacity, textBgOpacity },
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

      await page.locator("#sub-canvas").screenshot({
        path: outputPath,
        type: "png",
      });

      console.log(`[SubThumbnail] 저장: ${outputPath}`);
      return outputPath;
    } finally {
      await context.close();
      await browser.close();
    }
  }
}
