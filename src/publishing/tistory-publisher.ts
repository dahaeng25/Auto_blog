import type { Frame, Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { EDITOR_SELECTORS } from "../../config/editor-selectors.js";
import { createBrowserSession } from "../auth/browser-factory.js";
import { requireSession } from "../auth/session-manager.js";
import { BasePublisher } from "./base-publisher.js";
import type { PublishInput, PublishResult } from "./types.js";
import { humanType, humanPause } from "./utils/human-input.js";
import {
  findContentEditable,
  pasteHtmlToEditor,
} from "./utils/editor-paste.js";

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

    const statePath = await requireSession("tistory");
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
    const writeUrl = PLATFORMS.tistory.postWriteUrl(config.tistoryBlogName);
    console.log(`[티스토리] 글쓰기 페이지 이동: ${writeUrl}`);

    await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2000);

    const sel = EDITOR_SELECTORS.tistory;

    // 제목 — input 요소 우선 시도
    const titleInput = page.locator(sel.title).first();
    if ((await titleInput.count()) > 0) {
      await humanType(titleInput, input.title);
    } else {
      const titleEditable = await findContentEditable(page, sel.title);
      await humanType(titleEditable, input.title);
    }
    await humanPause(500);

    // 본문 — 에디터 iframe 탐색 후 HTML 붙여넣기
    const editorFrame = await this.getEditorFrame(page);
    const bodyLocator = await findContentEditable(
      editorFrame,
      sel.editorBody,
    );
    await pasteHtmlToEditor(page, bodyLocator, input.htmlBody);
    await humanPause(1000);

    await this.uploadImage(
      page,
      input.thumbnailPath,
      sel.fileInput,
      sel.imageButton,
    );

    return this.clickPublish(
      page,
      sel.publishButton,
      sel.publishConfirm,
      page,
    );
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
