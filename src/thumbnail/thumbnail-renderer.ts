import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { createScreenshotPage } from "../browser/create-screenshot-page.js";
import { config } from "../../config/index.js";
import {
  assetExists,
  loadThumbnailBrand,
  resolveAssetPath,
  type ThumbnailBrandConfig,
} from "./brand-config.js";
import { normalizeThumbnailLineBreaks } from "./normalize-thumbnail-line-breaks.js";
import { mutateImageHashBuffer } from "./image-hash-mutator.js";

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
      const whiteSpace = st.whiteSpace ?? "pre-wrap";

      let low = lo;
      let high = hi;
      let best = lo;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        el.style.fontSize = `${mid}px`;
        el.style.letterSpacing = "0px";

        let width = 0;
        if (lines) {
          for (let i = 0; i < lines.length; i++) {
            el.textContent = lines[i]!;
            el.style.whiteSpace = "nowrap";
            width = Math.max(width, el.scrollWidth);
          }
          el.textContent = content;
          el.style.whiteSpace = whiteSpace;
        } else {
          el.textContent = content;
          width = el.scrollWidth;
        }

        if (width <= tw) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      el.style.fontSize = `${best}px`;
      el.textContent = content;
      if (lines) {
        el.style.whiteSpace = whiteSpace;
      }

      if (expand) {
        let spacing = 0;
        while (spacing < 10) {
          let width = 0;
          el.style.letterSpacing = `${spacing}px`;
          if (lines) {
            for (let i = 0; i < lines.length; i++) {
              el.textContent = lines[i]!;
              el.style.whiteSpace = "nowrap";
              width = Math.max(width, el.scrollWidth);
            }
            el.textContent = content;
            el.style.whiteSpace = whiteSpace;
          } else {
            el.textContent = content;
            width = el.scrollWidth;
          }
          if (width >= tw * 0.96) break;
          spacing += 0.5;
          if (spacing > 0) {
            let nextWidth = 0;
            el.style.letterSpacing = `${spacing}px`;
            if (lines) {
              for (let i = 0; i < lines.length; i++) {
                el.textContent = lines[i]!;
                el.style.whiteSpace = "nowrap";
                nextWidth = Math.max(nextWidth, el.scrollWidth);
              }
            } else {
              el.textContent = content;
              nextWidth = el.scrollWidth;
            }
            if (nextWidth > tw) {
              el.style.letterSpacing = `${spacing - 0.5}px`;
              break;
            }
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
  const mainText = normalizeThumbnailLineBreaks(options.text).trim();
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
        canvas.style.background = "";
      } else if (b.background.type === "gradient" && b.background.gradient) {
        base.style.display = "none";
        canvas.style.background = b.background.gradient;
      } else if (b.background.type === "color" && b.background.color) {
        base.style.display = "none";
        canvas.style.background = b.background.color;
      }
    },
    { brand, baseUrl },
  );

  if (!baseUrl) return;

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
    const { brand: renderBrand, baseImagePath } = resolveRenderBrand(brand);
    const filename = options.outputFilename ?? "thumbnail_최종.png";
    const outputPath = path.join(config.thumbnailsDir, filename);

    if (
      !baseImagePath &&
      renderBrand.background.type !== "gradient" &&
      renderBrand.background.type !== "color"
    ) {
      throw new Error(
        "썸네일 배경 파일이 없습니다. assets/thumbnail/bg.png 를 확인하세요.",
      );
    }

    await fs.mkdir(config.thumbnailsDir, { recursive: true });

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

      await applyTemplate(page, renderBrand, baseImagePath);
      await injectTemplateText(page, options, renderBrand);

      const canvas = page.locator("#thumbnail-canvas");
      const screenshot = await canvas.screenshot({ type: "png" });
      const mutated = await mutateImageHashBuffer(screenshot);
      await fs.writeFile(outputPath, mutated);

      console.log(`[Thumbnail] 저장 완료: ${outputPath}`);
      return outputPath;
    } finally {
      await closePage();
      await browser.close();
    }
  }
}
