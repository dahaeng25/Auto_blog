import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchChromium } from "../browser/launch-chromium.js";
import { assetExists, resolveAssetPath } from "./brand-config.js";

const HEADER_REL = "assets/thumbnail/header-banner.png";
const FOOTER_REL = "assets/thumbnail/footer-banner.png";

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function cropFromImage(
  sourcePath: string,
  outputPath: string,
  region: CropRegion,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: region.width, height: region.height });

  try {
    const src = pathToFileURL(sourcePath).href;
    await page.setContent(
      `<img id="src" src="${src}" style="position:absolute;left:${-region.x}px;top:${-region.y}px;width:886px;height:886px;" />`,
      { waitUntil: "networkidle" },
    );
    await page.locator("#src").screenshot({ path: outputPath });
  } finally {
    await browser.close();
  }
}

/** bg.png 샘플에서 상단 로고·회사명, 하단 브랜드 문구 영역 추출 (최초 1회) */
export async function ensureBrandOverlayAssets(): Promise<{
  headerPath: string | null;
  footerPath: string | null;
}> {
  const headerPath = resolveAssetPath(HEADER_REL);
  const footerPath = resolveAssetPath(FOOTER_REL);
  const hasHeader = assetExists(HEADER_REL);
  const hasFooter = assetExists(FOOTER_REL);

  if (hasHeader && hasFooter) {
    return { headerPath, footerPath };
  }

  if (!assetExists("assets/thumbnail/bg.png")) {
    return {
      headerPath: hasHeader ? headerPath : null,
      footerPath: hasFooter ? footerPath : null,
    };
  }

  const bgPath = resolveAssetPath("assets/thumbnail/bg.png");
  console.log("[Thumbnail] bg.png에서 고정 로고·푸터 영역 추출 중...");

  if (!hasHeader) {
    await cropFromImage(bgPath, headerPath, {
      x: 0,
      y: 0,
      width: 886,
      height: 118,
    });
  }

  if (!hasFooter) {
    await cropFromImage(bgPath, footerPath, {
      x: 0,
      y: 818,
      width: 886,
      height: 68,
    });
  }

  return {
    headerPath: assetExists(HEADER_REL) ? headerPath : null,
    footerPath: assetExists(FOOTER_REL) ? footerPath : null,
  };
}
