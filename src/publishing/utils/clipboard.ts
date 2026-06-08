import type { Page } from "playwright";

/** HTML에서 plain text 추출 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 페이지 클립보드에 HTML + plain text를 동시에 기록합니다.
 * 에디터 붙여넣기 전에 호출하세요.
 */
export async function writeHtmlToClipboard(
  page: Page,
  html: string,
): Promise<void> {
  const plain = htmlToPlainText(html);

  await page.evaluate(
    async ({ htmlContent, plainContent }) => {
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      const plainBlob = new Blob([plainContent], { type: "text/plain" });

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": plainBlob,
        }),
      ]);
    },
    { htmlContent: html, plainContent: plain },
  );
}
