import type { Page as PlaywrightPage } from "playwright-core";
import type { Page as PuppeteerPage } from "puppeteer-core";
import type { ThumbnailBrandConfig } from "./brand-config.js";
import { normalizeThumbnailLineBreaks } from "./normalize-thumbnail-line-breaks.js";

export interface ThumbnailTextOptions {
  text: string;
  topLabel?: string;
}

/** Playwright·Puppeteer 공통 evaluate 페이지 */
export type ScriptPage = {
  evaluate<T, U>(pageFunction: (arg: U) => T | Promise<T>, arg: U): Promise<T>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  waitForFunction(
    pageFunction: () => boolean | Promise<boolean>,
    options?: { timeout?: number },
  ): Promise<unknown>;
};

async function fitFontSizeToWidth(
  page: ScriptPage,
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

export async function injectThumbnailTemplateText(
  page: ScriptPage,
  options: ThumbnailTextOptions,
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

  await page.evaluate(
    ({ widthPercent, maxWidth }) => {
      const mainEl = document.getElementById("thumbnail-main-title");
      if (mainEl) {
        mainEl.style.width = `${widthPercent}%`;
        mainEl.style.maxWidth = maxWidth;
      }
    },
    { widthPercent: main.widthPercent ?? 90, maxWidth: main.maxWidth },
  );
}

export async function applyThumbnailTemplate(
  page: ScriptPage,
  brand: ThumbnailBrandConfig,
  baseImagePath: string | null,
  baseImageUrl: string | null,
  engine: "playwright" | "puppeteer" = "puppeteer",
): Promise<void> {
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
    { brand, baseUrl: baseImageUrl },
  );

  if (!baseImagePath) return;

  const imageReady = () => {
    const img = document.getElementById(
      "thumbnail-base",
    ) as HTMLImageElement | null;
    return Boolean(img?.complete && img.naturalWidth > 0);
  };

  if (engine === "playwright") {
    await (page as PlaywrightPage).waitForFunction(imageReady, undefined, {
      timeout: 15_000,
    });
  } else {
    await (page as PuppeteerPage).waitForFunction(imageReady, {
      timeout: 15_000,
    });
  }
}

export type { PuppeteerPage };
