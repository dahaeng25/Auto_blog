import type { Frame, Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { EDITOR_SELECTORS } from "../../config/editor-selectors.js";
import { createBrowserSession } from "../auth/browser-factory.js";
import { ensureValidSession } from "../auth/ensure-session.js";
import { BasePublisher } from "./base-publisher.js";
import type { PublishInput, PublishResult } from "./types.js";
import { editorSettleDelay } from "./utils/dom-utils.js";
import { humanPause } from "./utils/human-input.js";
import { fillBodyWithImages } from "./body-images/body-image-inserter.js";
import { clickTistoryPublicPublish } from "./utils/tistory-publish.js";
import { assertEditorAccessible } from "../auth/login-check.js";
import {
  navigateToWritePage,
  normalizeTistoryBlogName,
} from "../auth/write-page-nav.js";
import {
  fillPlainTextToEditor,
  findContentEditable,
} from "./utils/editor-paste.js";
import { sanitizeBlogTitle } from "../content/sanitize-title.js";

/**
 * 티스토리 에디터 퍼블리셔 (오픈 API 종료 → 브라우저 RPA)
 */
export class TistoryPublisher extends BasePublisher {
  protected platformName = "티스토리";

  protected getPlatform(): PublishResult["platform"] {
    return "tistory";
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!config.tistoryBlogName) {
      return this.failResult(
        "TISTORY_BLOG_NAME 환경변수가 설정되지 않았습니다.",
      );
    }

    await this.validateThumbnail(input.thumbnailPath);

    const statePath = await ensureValidSession("tistory");
    const session = await createBrowserSession({
      headless: config.publishHeadless,
      storageStatePath: statePath,
    });

    const page = await session.context.newPage();
    await session.context.grantPermissions(["clipboard-read", "clipboard-write"]);

    try {
      const postUrl = await this.fillAndPublish(page, input);
      return this.successResult(postUrl);
    } catch (error) {
      return this.failResult(error);
    } finally {
      await page.close();
      await session.close();
    }
  }

  private async fillAndPublish(
    page: Page,
    input: PublishInput,
  ): Promise<string | undefined> {
    const writeUrl = await navigateToWritePage(
      page,
      "tistory",
      normalizeTistoryBlogName(config.tistoryBlogName),
    );
    console.log(`[티스토리] 글쓰기 페이지 이동: ${writeUrl}`);

    await assertEditorAccessible(page, "tistory");

    const sel = EDITOR_SELECTORS.tistory;

    // 제목 — insertHTML / 클립보드 붙여넣기 (타이핑 금지)
    let titleTyped = false;
    const plainTitle = sanitizeBlogTitle(input.title);
    for (let i = 0; i < 25; i++) {
      const titleInput = page.locator(sel.title).first();
      if ((await titleInput.count()) > 0 && (await titleInput.isVisible())) {
        await fillPlainTextToEditor(page, titleInput, plainTitle);
        titleTyped = true;
        break;
      }
      await humanPause(500);
    }

    if (!titleTyped) {
      const titleEditable = await findContentEditable(page, sel.title);
      await fillPlainTextToEditor(page, titleEditable, plainTitle);
    }
    await humanPause(500);

    // 본문 — 에디터 iframe 탐색 후 HTML 붙여넣기
    const editorFrame = await this.getEditorFrame(page);
    const bodyLocator = await findContentEditable(
      editorFrame,
      sel.editorBody,
    );
    await fillBodyWithImages({
      page,
      platform: "tistory",
      platformName: this.platformName,
      htmlBody: input.htmlBody,
      thumbnailPath: input.thumbnailPath,
      bodyLocator,
      editorContext: editorFrame,
      imageButtonSelector: sel.imageButton,
      fileInputSelector: sel.fileInput,
      preparedImages: input.naverImages
        ? [input.naverImages.thumbnail, ...input.naverImages.bodyImages]
        : undefined,
    });
    await humanPause(editorSettleDelay(input.htmlBody.length));

    return clickTistoryPublicPublish(page, [page, editorFrame]);
  }

  /** 티스토리 에디터 iframe 탐색 */
  private async getEditorFrame(page: Page): Promise<Frame | Page> {
    const sel = EDITOR_SELECTORS.tistory;
    const iframe = page.locator(sel.editorFrame).first();

    if ((await iframe.count()) > 0) {
      const handle = await iframe.elementHandle();
      const frame = await handle?.contentFrame();
      if (frame) return frame;
    }

    return page;
  }
}
