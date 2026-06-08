import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { config } from "../../config/index.js";

export interface ThumbnailRenderOptions {
  /** 썸네일 중앙에 표시할 메인 문구 (Phase 2 thumbnailText) */
  text: string;
  /** 하단 부제목 (선택, 블로그 제목 등) */
  subtitle?: string;
  /** 출력 파일명 — 기본값: thumbnail_최종.png */
  outputFilename?: string;
}

/** 텍스트 길이에 따라 폰트 크기를 자동 조절 */
function calcFontSize(text: string): number {
  const len = text.length;
  if (len <= 8) return 64;
  if (len <= 14) return 52;
  if (len <= 20) return 44;
  return 36;
}

/**
 * HTML 템플릿에 텍스트를 주입하고 폰트 크기를 조정합니다.
 */
async function injectText(page: Page, options: ThumbnailRenderOptions): Promise<void> {
  const fontSize = calcFontSize(options.text);

  await page.evaluate(
    ({ text, subtitle, fontSize: size }) => {
      const mainEl = document.getElementById("thumbnail-text");
      const subEl = document.getElementById("thumbnail-subtitle");
      if (!mainEl) throw new Error("#thumbnail-text 엘리먼트를 찾을 수 없습니다.");

      mainEl.textContent = text;
      mainEl.style.fontSize = `${size}px`;

      if (subEl) {
        subEl.textContent = subtitle ?? "";
        subEl.style.display = subtitle ? "block" : "none";
      }
    },
    { text: options.text, subtitle: options.subtitle ?? "", fontSize },
  );
}

/**
 * Phase 3: HTML/CSS 템플릿을 Playwright로 렌더링하여
 * 고해상도 PNG 썸네일을 생성합니다.
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
    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    try {
      const templateUrl = pathToFileURL(this.templatePath).href;
      await page.goto(templateUrl, { waitUntil: "domcontentloaded" });

      // Google Fonts 로딩 대기
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      await injectText(page, options);

      const canvas = page.locator("#thumbnail-canvas");
      await canvas.waitFor({ state: "visible" });

      await canvas.screenshot({ path: outputPath, type: "png" });

      console.log(`[Thumbnail] 저장 완료: ${outputPath}`);
      return outputPath;
    } finally {
      await context.close();
      await browser.close();
    }
  }
}
