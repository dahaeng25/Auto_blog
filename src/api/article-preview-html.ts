/** 미리보기 HTML에서 script 태그 제거 */
export function stripPreviewScripts(html: string): string {
  return String(html).replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
}

/** 대시보드 iframe용 독립 HTML 문서 */
export function buildArticlePreviewHtml(
  title: string,
  htmlBody: string,
): string {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = stripPreviewScripts(htmlBody);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    body {
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      line-height: 1.75;
      padding: 20px 24px;
      margin: 0;
      color: #1a1a1a;
      background: #fff;
    }
    h2, h3 { margin: 1.2em 0 0.6em; font-size: 1.1em; }
    p, li { margin: 0.5em 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    img { max-width: 100%; height: auto; }
    blockquote {
      margin: 12px 0;
      padding: 8px 12px;
      border-left: 3px solid #ccc;
      color: #444;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
