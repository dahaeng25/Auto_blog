import { loadBlogStyle } from "./load-style.js";

function stripInlineStyle(tagHtml: string): string {
  return tagHtml.replace(/\s*style="[^"]*"/gi, "");
}

function pStyle(
  align: string,
  margin: string,
  typo: ReturnType<typeof loadBlogStyle>["typography"],
): string {
  return `font-family:${typo.fontFamily};font-size:${typo.bodyFontSize};line-height:${typo.bodyLineHeight};color:${typo.bodyColor};text-align:${align};margin:${margin};`;
}

/** 시스템이 삽입한 구분선·브랜드 문구 제거 — 재적용 시 중복 방지 */
function stripSystemDecorations(html: string): string {
  const style = loadBlogStyle();
  let result = html;

  result = result.replace(
    /<hr[^>]*style="[^"]*border-top:1px solid #bbbbbb[^"]*"[^>]*>/gi,
    "",
  );

  const tagline = style.brandTagline ?? "강운준 행정사";
  const escaped = tagline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  result = result.replace(
    new RegExp(`<p[^>]*>\\s*${escaped}[^<]*</p>`, "gi"),
    "",
  );

  return result.trim();
}

/** LLM·Gems HTML 정규화 — 업로드 전 서식 통일 */
export function normalizeHtmlBeforeStyle(html: string): string {
  return html
    .replace(/<\/?(strong|b)\b[^>]*>/gi, "")
    .replace(/<h1(\s[^>]*)?>/gi, "<h2>")
    .replace(/<\/h1>/gi, "</h2>")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\salign="[^"]*"/gi, "")
    .trim();
}

/** 첫 번째 h2 이전 = 도입부 */
function splitIntroAndSections(html: string): { intro: string; sections: string[] } {
  const match = html.search(/<h2[\s>]/i);
  if (match === -1) {
    return { intro: html.trim(), sections: [] };
  }

  return {
    intro: html.slice(0, match).trim(),
    sections: html
      .slice(match)
      .split(/(?=<h2[\s>])/i)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function restyleParagraphs(block: string, align: string, margin: string): string {
  const typo = loadBlogStyle().typography;
  const style = pStyle(align, margin, typo);

  return block.replace(/<p(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<p${attrs}>`);
    return clean.replace(/<p/, `<p style="${style}"`);
  });
}

/** 마무리 구간(마치며·면책·해시태그·사무소)만 가운데 정렬 */
function restyleFooterParagraphs(section: string): string {
  const style = loadBlogStyle();
  const footerAlign = style.typography.footerAlign ?? "center";
  const margin = style.spacing.paragraphMargin;
  const typo = style.typography;
  const footerStyle = pStyle(footerAlign, margin, typo);
  const footerPattern =
    /<p[^>]*>([^<]*(?:마치며|강운준 행정사였습니다|행정사사무소|1844-1346|※ 본 정보|#\w)[^<]*)<\/p>/gi;

  return section.replace(footerPattern, (_full, content) => {
    return `<p style="${footerStyle}">${content.trim()}</p>`;
  });
}

function restyleBlockquotes(block: string): string {
  const style = loadBlogStyle();
  const bq = style.blockquote ?? { borderColor: "#1a3a5c", background: "#f7f9fc" };
  const typo = style.typography;
  const bqStyle =
    `font-family:${typo.fontFamily};font-size:15px;line-height:${typo.bodyLineHeight};` +
    `color:#444444;border-left:4px solid ${bq.borderColor};background:${bq.background};` +
    `padding:14px 18px;margin:20px 0;`;

  return block.replace(/<blockquote(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<blockquote${attrs}>`);
    return clean.replace(/<blockquote/, `<blockquote style="${bqStyle}"`);
  });
}

function restyleH3(section: string): string {
  const { typography: typo } = loadBlogStyle();
  const style =
    `font-family:${typo.fontFamily};font-size:${typo.h3FontSize};font-weight:${typo.h3FontWeight};` +
    `color:${typo.h3Color};text-align:${typo.h3Align};margin:${typo.h3Margin};line-height:1.5;`;

  return section.replace(/<h3(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<h3${attrs}>`);
    return clean.replace(/<h3/, `<h3 style="${style}"`);
  });
}

function restyleH2(section: string): string {
  const { typography: typo } = loadBlogStyle();
  const borderBottom = typo.h2BorderBottom ?? "2px solid #1a3a5c";
  const paddingBottom = typo.h2PaddingBottom ?? "10px";
  const letterSpacing = typo.h2LetterSpacing ?? "-0.3px";
  const style =
    `font-family:${typo.fontFamily};font-size:${typo.h2FontSize};font-weight:${typo.h2FontWeight};` +
    `color:${typo.h2Color};text-align:${typo.h2Align};margin:${typo.h2Margin};` +
    `padding:0 0 ${paddingBottom} 0;border-bottom:${borderBottom};` +
    `line-height:1.45;letter-spacing:${letterSpacing};`;

  let result = restyleH3(section);

  result = result.replace(/<h2(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<h2${attrs}>`);
    return clean.replace(/<h2/, `<h2 style="${style}"`);
  });

  result = restyleParagraphs(
    result,
    loadBlogStyle().typography.bodyAlign,
    loadBlogStyle().spacing.paragraphMargin,
  );

  result = restyleBlockquotes(result);
  result = restyleFooterParagraphs(result);

  result = result.replace(/<ul(\s[^>]*)?>/gi, () => {
    const typo = loadBlogStyle().typography;
    return `<ul style="font-family:${typo.fontFamily};font-size:${typo.listFontSize};line-height:${typo.bodyLineHeight};color:${typo.bodyColor};margin:14px 0 18px 22px;padding:0;">`;
  });

  result = result.replace(/<li(\s[^>]*)?>/gi, () => {
    const typo = loadBlogStyle().typography;
    return `<li style="font-family:${typo.fontFamily};font-size:${typo.listFontSize};line-height:${typo.bodyLineHeight};color:${typo.bodyColor};margin:0 0 10px 0;">`;
  });

  result = result.replace(/<table(\s[^>]*)?>/gi, () => {
    const typo = loadBlogStyle().typography;
    return (
      `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-family:${typo.fontFamily};` +
      `font-size:${typo.tableFontSize};color:${typo.bodyColor};">`
    );
  });

  result = restyleTableCells(result);

  return result;
}

function restyleTableCells(html: string): string {
  const thStyle =
    "border:1px solid #d0d0d0;padding:10px 8px;background:#f5f7fa;text-align:center;font-weight:700;";
  const tdStyle =
    "border:1px solid #d0d0d0;padding:10px 8px;text-align:left;vertical-align:top;";

  let result = html.replace(/<th(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<th${attrs}>`);
    return clean.replace(/<th/, `<th style="${thStyle}"`);
  });

  result = result.replace(/<td(\s[^>]*)?>/gi, (_full, attrs = "") => {
    const clean = stripInlineStyle(`<td${attrs}>`);
    return clean.replace(/<td/, `<td style="${tdStyle}"`);
  });

  return result;
}

function getBrandBandHtml(): string {
  const style = loadBlogStyle();
  if (style.brandBand?.html) return style.brandBand.html;

  const tagline = style.brandTagline ?? "강운준 행정사";
  const typo = style.typography;
  return (
    `<p style="text-align:${typo.bodyAlign};font-family:${typo.fontFamily};font-size:15px;` +
    `line-height:${typo.bodyLineHeight};color:#555555;margin:16px 0;">${tagline}</p>`
  );
}

/**
 * AI·외부 원고 HTML에 dahaeng25 샘플 기준 폰트·구분선·정렬 적용
 */
export function applyBlogStyle(html: string): string {
  const style = loadBlogStyle();
  const cleaned = normalizeHtmlBeforeStyle(stripSystemDecorations(html));
  const { intro, sections } = splitIntroAndSections(cleaned);

  let output = restyleParagraphs(
    intro,
    style.typography.introAlign,
    style.spacing.introParagraphMargin,
  );

  const showBrandOnce = sections.length > 0;
  if (showBrandOnce) {
    output += getBrandBandHtml();
  }

  const repeatBrand = style.brandBand?.repeatPerSection === true;

  for (const section of sections) {
    output += style.divider.html;
    if (repeatBrand) {
      output += getBrandBandHtml();
    }
    output += restyleH2(section);
  }

  return output;
}
