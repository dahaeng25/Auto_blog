import { loadBlogStyle } from "./load-style.js";

function stripInlineStyle(tagHtml: string): string {
  return tagHtml.replace(/\s*style="[^"]*"/gi, "");
}

function pStyle(align: string, margin: string, typo: ReturnType<typeof loadBlogStyle>["typography"]): string {
  return `font-family:${typo.fontFamily};font-size:${typo.bodyFontSize};line-height:${typo.bodyLineHeight};color:${typo.bodyColor};text-align:${align};margin:${margin};`;
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

  return block.replace(/<p(\s[^>]*)?>/gi, (full, attrs = "") => {
    const clean = stripInlineStyle(`<p${attrs}>`);
    return clean.replace(/<p/, `<p style="${style}"`);
  });
}

function restyleH2(section: string): string {
  const { typography: typo } = loadBlogStyle();
  const style =
    `font-family:${typo.fontFamily};font-size:${typo.h2FontSize};font-weight:${typo.h2FontWeight};` +
    `color:${typo.h2Color};text-align:${typo.h2Align};margin:${typo.h2Margin};line-height:1.4;`;

  let result = section.replace(/<h2(\s[^>]*)?>/gi, (full, attrs = "") => {
    const clean = stripInlineStyle(`<h2${attrs}>`);
    return clean.replace(/<h2/, `<h2 style="${style}"`);
  });

  result = restyleParagraphs(
    result,
    loadBlogStyle().typography.bodyAlign,
    loadBlogStyle().spacing.paragraphMargin,
  );

  result = result.replace(/<ul(\s[^>]*)?>/gi, () => {
    const typo = loadBlogStyle().typography;
    return `<ul style="font-family:${typo.fontFamily};font-size:${typo.listFontSize};line-height:${typo.bodyLineHeight};color:${typo.bodyColor};margin:12px 0 16px 20px;padding:0;">`;
  });

  result = result.replace(/<table(\s[^>]*)?>/gi, () => {
    const typo = loadBlogStyle().typography;
    return (
      `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:${typo.fontFamily};` +
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

/**
 * AI 생성 HTML에 샘플 블로그(blue_directors)와 동일한 폰트·크기·구성 스타일 적용
 */
export function applyBlogStyle(html: string): string {
  const style = loadBlogStyle();
  const { intro, sections } = splitIntroAndSections(html.trim());

  let output = restyleParagraphs(
    intro,
    style.typography.introAlign,
    style.spacing.introParagraphMargin,
  );

  for (const section of sections) {
    output += style.divider.html;
    output += restyleH2(section);
  }

  return output;
}
