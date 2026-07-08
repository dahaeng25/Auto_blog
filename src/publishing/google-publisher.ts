import type { Page } from "playwright";
import { config } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { EDITOR_SELECTORS } from "../../config/editor-selectors.js";
import { createBrowserSession, getSessionPage } from "../auth/browser-factory.js";
import { ensureValidSession } from "../auth/ensure-session.js";
import { assertEditorAccessible } from "../auth/login-check.js";
import { BasePublisher } from "./base-publisher.js";
import type { PublishInput, PublishResult } from "./types.js";
import { editorSettleDelay } from "./utils/dom-utils.js";
import { humanPause, humanType } from "./utils/human-input.js";
import { pasteHtmlToEditor } from "./utils/editor-paste.js";
import { logger } from "../monitoring/logger.js";

/**
 * Google Blogger 퍼블리셔 (브라우저 RPA)
 * BLOGGER_BLOG_ID — Blogger 대시보드 URL의 숫자 블로그 ID
 */
export class GooglePublisher extends BasePublisher {
  protected platformName = "Google Blogger";

  protected getPlatform(): PublishResult["platform"] {
    return "google";
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!config.bloggerBlogId) {
      return this.failResult(
        "BLOGGER_BLOG_ID 환경 변수가 설정되지 않았습니다.",
      );
    }

    await this.validateThumbnail(input.thumbnailPath);

    const statePath = await ensureValidSession("google");
    const session = await createBrowserSession({
      headless: config.publishHeadless,
      storageStatePath: statePath,
    });

    const page = await getSessionPage(session);
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
    const writeUrl = PLATFORMS.google.postWriteUrl(config.bloggerBlogId);
    logger.info(`[Google] 글쓰기 페이지 이동: ${writeUrl}`);

    await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await humanPause(3000);

    await assertEditorAccessible(page, "google");

    const sel = EDITOR_SELECTORS.google;

    // 제목
    let titleTyped = false;
    for (let i = 0; i < 30; i++) {
      const titleInput = page.locator(sel.title).first();
      if ((await titleInput.count()) > 0 && (await titleInput.isVisible())) {
        await humanType(titleInput, input.title);
        titleTyped = true;
        break;
      }
      await humanPause(500);
    }
    if (!titleTyped) {
      throw new Error("Blogger 제목 입력란을 찾지 못했습니다.");
    }

    await humanPause(800);

    // 썸네일
    await this.uploadImage(
      page,
      input.thumbnailPath,
      [page],
      sel.imageButton,
      sel.fileInput,
    );

    await humanPause(1000);

    // 본문 — HTML 붙여넣기
    const body = page.locator(sel.editorBody).first();
    await body.waitFor({ state: "visible", timeout: 30_000 });
    await pasteHtmlToEditor(page, body, input.htmlBody);
    await humanPause(editorSettleDelay(input.htmlBody.length));

    if (config.publishDryRun) {
      logger.info("[Google] DRY-RUN — 발행 버튼 클릭 생략");
      return undefined;
    }

    return this.clickPublish(page, [page], sel.publishButton, sel.publishConfirm);
  }
}
