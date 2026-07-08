import fs from "node:fs";
import path from "node:path";
import { brand } from "../../config/brand.js";
import { config } from "../../config/index.js";

export interface NaverFooterImageBlock {
  type: "image";
  file: string;
  alt?: string;
  linkUrl?: string;
}

export interface NaverFooterHtmlBlock {
  type: "html";
  html: string;
}

export type NaverFooterBlock = NaverFooterImageBlock | NaverFooterHtmlBlock;

export interface NaverPostFooterConfig {
  enabled: boolean;
  htmlFile?: string;
  blocks?: NaverFooterBlock[];
}

export interface NaverFooterPublishBlock {
  kind: "html" | "image";
  html?: string;
  path?: string;
  label: string;
  altText?: string;
  linkUrl?: string;
}

function resolveProjectPath(relativePath: string): string {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(config.projectRoot, relativePath);
}

/** 정적 JSON/HTML의 브랜드 문구를 config/brand.ts 값으로 치환 */
function applyBrandPlaceholders(text: string): string {
  return text
    .replaceAll("{{BRAND_NAME}}", brand.brandName)
    .replaceAll("{{OFFICE_NAME}}", brand.officeName)
    .replaceAll("{{CONTACT_PHONE}}", brand.contactPhone)
    .replaceAll("강운준 행정사", brand.brandName)
    .replaceAll("행정사사무소 다행", brand.officeName)
    .replaceAll("1844-1346", brand.contactPhone)
    .replaceAll("1844-1347", brand.contactPhone);
}

function loadFooterConfig(): NaverPostFooterConfig | null {
  const configPath = resolveProjectPath(config.naverPostFooterPath);
  if (!fs.existsSync(configPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as NaverPostFooterConfig;
  } catch {
    console.warn(`[NaverFooter] 설정 파일 파싱 실패: ${configPath}`);
    return null;
  }
}

function loadHtmlFile(relativePath: string): string | null {
  const abs = resolveProjectPath(relativePath);
  if (!fs.existsSync(abs)) {
    console.warn(`[NaverFooter] HTML 파일 없음: ${abs}`);
    return null;
  }
  return applyBrandPlaceholders(fs.readFileSync(abs, "utf-8").trim());
}

/** 네이버 업로드 맨 끝에 붙일 푸터 블록 생성 */
export function buildNaverFooterPublishBlocks(): NaverFooterPublishBlock[] {
  if (!config.naverPostFooterEnabled) return [];

  const footerConfig = loadFooterConfig();
  if (!footerConfig?.enabled) return [];

  const blocks: NaverFooterPublishBlock[] = [];

  if (footerConfig.htmlFile) {
    const html = loadHtmlFile(footerConfig.htmlFile);
    if (html) {
      blocks.push({
        kind: "html",
        html,
        label: "푸터 HTML 템플릿",
      });
    }
  }

  for (const block of footerConfig.blocks ?? []) {
    if (block.type === "html") {
      const html = applyBrandPlaceholders(block.html.trim());
      if (!html) continue;
      blocks.push({
        kind: "html",
        html,
        label: "푸터 HTML 블록",
      });
      continue;
    }

    const abs = resolveProjectPath(block.file);
    if (!fs.existsSync(abs)) {
      console.warn(`[NaverFooter] 이미지 없음 — 건너뜀: ${abs}`);
      continue;
    }

    blocks.push({
      kind: "image",
      path: abs,
      label: `푸터 이미지 (${path.basename(abs)})`,
      altText: block.alt ? applyBrandPlaceholders(block.alt) : undefined,
      linkUrl: block.linkUrl,
    });
  }

  if (blocks.length > 0) {
    console.log(`[NaverFooter] 본문 맨 끝 푸터 ${blocks.length}블록 적용`);
  }

  return blocks;
}
