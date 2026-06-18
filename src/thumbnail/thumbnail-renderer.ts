import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
  type ThumbnailBrandConfig,
} from "./brand-config.js";

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

function fitFontSizeToWidth(
  page: Page,
  selector: string,
  text: string,
  targetWidth: number,
  min: number,
  max: number,
  styles: Record<string, string>,
  expandLetterSpacing = false,
): Promise<number> {
  return page.evaluate(
    ({ selector: sel, text: content, targetWidth: tw, min: lo, max: hi, styles: st, expand }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`요소 없음: ${sel}`);

      Object.assign(el.style, st);

      const lines = content.includes("\n") ? content.split("\n") : null;

      const measureWidth = (fontSize: number): number => {
        el.style.fontSize = `${fontSize}px`;
        el.style.letterSpacing = "0px";

        if (lines) {
          let maxW = 0;
          for (const line of lines) {
            el.textContent = line;
            el.style.whiteSpace = "nowrap";
            maxW = Math.max(maxW, el.scrollWidth);
          }
          el.textContent = content;
          el.style.whiteSpace = st.whiteSpace ?? "pre-wrap";
          return maxW;
        }

        el.textContent = content;
        return el.scrollWidth;
      };

      let low = lo;
      let high = hi;
      let best = lo;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (measureWidth(mid) <= tw) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      el.style.fontSize = `${best}px`;
      el.textContent = content;
      if (lines) {
        el.style.whiteSpace = st.whiteSpace ?? "pre-wrap";
      }

      if (expand) {
        let spacing = 0;
        while (measureWidth(best) < tw * 0.96 && spacing < 10) {
          spacing += 0.5;
          el.style.letterSpacing = `${spacing}px`;
          if (measureWidth(best) > tw) {
            el.style.letterSpacing = `${spacing - 0.5}px`;
            break;
          }
        }
      }

      return best;
    },
    {
      selector,
      text,
      targetWidth,
      min,
      max,
      styles,
      expand: expandLetterSpacing,
    },
  );
}

async function injectTemplateText(
  page: Page,
  options: ThumbnailRenderOptions,
  brand: ThumbnailBrandConfig,
): Promise<void> {
  const top = brand.topLabel;
  const main = brand.mainTitle;
  if (!top || !main) {
    throw new Error("brand.json에 topLabel·mainTitle 설정이 필요합니다.");
  }

  const topLabel = options.topLabel?.trim() ?? "";
  const mainText = options.text.trim();
  const canvasWidth = brand.canvas.width;
  const topTargetWidth = canvasWidth * ((top.widthPercent ?? 62) / 100);
  const mainTargetWidth = canvasWidth * ((main.widthPercent ?? 90) / 100);

  await page.evaluate(
    ({ top, main, topTargetWidth, canvasWidth }) => {
      const wrap = document.getElementById("top-label-wrap");
      const pill = document.getElementById("top-label-pill");
      const mainEl = document.getElementById("thumbnail-main-title");
      const topCover = document.getElementById("top-label-cover");
      const mainCover = document.getElementById("main-title-cover");

      if (!wrap || !pill || !mainEl) {
        throw new Error("썸네일 템플릿 DOM 요소를 찾을 수 없습니다.");
      }

      wrap.style.top = top.top;
      wrap.style.width = `${topTargetWidth}px`;
      wrap.style.justifyContent = "center";

      pill.style.border = top.pill.border;
      pill.style.background = top.pill.background;
      pill.style.borderRadius = top.pill.borderRadius;
      pill.style.padding = top.pill.padding;
      pill.style.width = "100%";
      pill.style.justifyContent = "center";

      mainEl.style.top = main.top;
      mainEl.style.width = `${main.widthPercent ?? 90}%`;
      mainEl.style.left = "50%";
      mainEl.style.transform = "translateX(-50%)";
      mainEl.style.maxWidth = main.maxWidth;
      mainEl.style.padding = "0";
      mainEl.style.textAlign = "center";

      if (topCover) topCover.style.display = "none";
      if (mainCover) mainCover.style.display = "none";
    },
    { top, main, topTargetWidth, canvasWidth },
  );

  await fitFontSizeToWidth(
    page,
    "#thumbnail-top-label",
    topLabel,
    topTargetWidth,
    top.fontSizeMin,
    top.fontSizeMax,
    {
      fontFamily: top.fontFamily,
      fontWeight: top.fontWeight,
      color: top.color,
      whiteSpace: "nowrap",
      textAlign: "center",
      display: "block",
      width: "100%",
    },
    true,
  );

  await fitFontSizeToWidth(
    page,
    "#thumbnail-main-title",
    mainText,
    mainTargetWidth,
    main.fontSizeMin,
    main.fontSizeMax,
    {
      fontFamily: main.fontFamily,
      fontWeight: main.fontWeight,
      color: main.color,
      lineHeight: String(main.lineHeight),
      whiteSpace: "pre-wrap",
      wordBreak: "keep-all",
      textAlign: "center",
      width: "max-content",
      maxWidth: "none",
      webkitTextStroke: `${main.strokeWidth} ${main.strokeColor}`,
      paintOrder: "stroke fill",
    },
    false,
  );

  await page.evaluate(({ widthPercent, maxWidth }) => {
    const mainEl = document.getElementById("thumbnail-main-title");
    if (mainEl) {
      mainEl.style.width = `${widthPercent}%`;
      mainEl.style.maxWidth = maxWidth;
    }
  }, { widthPercent: main.widthPercent ?? 90, maxWidth: main.maxWidth });
}

function resolveBaseImage(brand: ThumbnailBrandConfig): string | null {
  if (brand.background.type === "image" && assetExists(brand.background.image)) {
    return resolveAssetPath(brand.background.image!);
  }
  return null;
}

async function applyTemplate(
  page: Page,
  brand: ThumbnailBrandConfig,
  baseImagePath: string | null,
): Promise<void> {
  const baseUrl = baseImagePath ? pathToFileURL(baseImagePath).href : null;

  await page.evaluate(
    ({ brand: b, baseUrl: bg }) => {
      const canvas = document.getElementById("thumbnail-canvas");
      const base = document.getElementById("thumbnail-base") as HTMLImageElement | null;
      if (!canvas || !base) return;

      canvas.style.width = `${b.canvas.width}px`;
      canvas.style.height = `${b.canvas.height}px`;

      if (bg) {
        base.src = bg;
        base.style.display = "block";
      }
    },
    { brand, baseUrl },
  );

  await page.waitForFunction(
    () => {
      const img = document.getElementById(
        "thumbnail-base",
      ) as HTMLImageElement | null;
      return Boolean(img?.complete && img.naturalWidth > 0);
    },
    undefined,
    { timeout: 15_000 },
  );
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
    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(config.thumbnailsDir, filename);
    const baseImagePath = resolveBaseImage(brand);

    if (!baseImagePath) {
      throw new Error(
        "썸네일 배경 파일이 없습니다. assets/thumbnail/bg.png 를 확인하세요.",
      );
    }

    await fs.mkdir(config.thumbnailsDir, { recursive: true });

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

      await applyTemplate(page, brand, baseImagePath);
      await injectTemplateText(page, options, brand);

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
