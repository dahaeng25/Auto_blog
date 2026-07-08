import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, Page } from "playwright-core";
import { launchChromium } from "../browser/launch-chromium.js";
import { config } from "../../config/index.js";
import { parseH2SectionTitle } from "../publishing/images/keyword-slug.js";
import { mutateImageHashBuffer } from "./image-hash-mutator.js";

export interface SubThumbnailRenderOptions {
  /** 단락(h2) 소제목 — 중앙 키워드/문구로 표시 */
  sectionTitle: string;
  /** 저장 파일명 (예: D84외국인창업2.png) */
  outputFilename: string;
  /** 그라데이션 팔레트 순환용 (0부터) */
  sectionIndex?: number;
  contactName?: string;
  phone?: string;
}

const TITLE_MAX_CHARS = 28;

const GRADIENT_PRESETS = [
  "linear-gradient(145deg, #1a3a5c 0%, #2d6a9f 48%, #1e4d73 100%)",
  "linear-gradient(145deg, #152d47 0%, #3a7ca5 55%, #1a3a5c 100%)",
  "linear-gradient(145deg, #1e4466 0%, #4a8fb8 50%, #163a56 100%)",
  "linear-gradient(145deg, #0f2a42 0%, #2b5f8a 52%, #1a3a5c 100%)",
  "linear-gradient(145deg, #1a3a5c 0%, #3d8bb5 45%, #234b6e 100%)",
];

function buildSectionKeyword(sectionTitle: string): string {
  const parsed = parseH2SectionTitle(sectionTitle);
  return parsed.title.slice(0, TITLE_MAX_CHARS);
}

function pickGradient(sectionIndex: number): string {
  return GRADIENT_PRESETS[sectionIndex % GRADIENT_PRESETS.length]!;
}

async function fitSectionKeywordFont(
  page: Page,
  text: string,
  maxWidth: number,
): Promise<void> {
  await page.evaluate(
    ({ text: content, maxWidth: mw }) => {
      const el = document.getElementById("section-keyword");
      if (!el) return;

      let size = 56;
      const min = 32;
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
 * 단락별 서브썸네일 (700×700) — 그라데이션 + 중앙 키워드 + 우하단 연락처.
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

    const keyword = buildSectionKeyword(options.sectionTitle);
    const contactName =
      options.contactName ?? config.subThumbnailContactName;
    const phone = options.phone ?? config.subThumbnailContactPhone;
    const gradient = pickGradient(options.sectionIndex ?? 0);

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
        ({ size, keyword, contactName, phone, gradient }) => {
          const canvas = document.getElementById("sub-canvas");
          const bg = document.getElementById("bg-gradient");
          const keywordEl = document.getElementById("section-keyword");
          const nameEl = document.getElementById("contact-name");
          const phoneEl = document.getElementById("contact-phone");

          if (canvas) {
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
          }
          if (bg) bg.style.background = gradient;
          if (keywordEl) keywordEl.textContent = keyword;
          if (nameEl) nameEl.textContent = contactName;
          if (phoneEl) phoneEl.textContent = phone;
        },
        { size: this.size, keyword, contactName, phone, gradient },
      );

      await fitSectionKeywordFont(page, keyword, this.size * 0.86);

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
