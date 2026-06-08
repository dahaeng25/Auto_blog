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
 * 네이버 블로그 스마트에디터 ONE 퍼블리셔.
 * 세션 쿠키 주입 → 글쓰기 페이지 직행 → 클립보드/insertHTML 붙여넣기
 */
export class NaverPublisher extends BasePublisher {
  protected platformName = "네이버";

  protected getPlatform(): PublishResult["platform"] {
    return "naver";
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!config.naverBlogId) {
      return this.failResult("NAVER_BLOG_ID 환경변수가 설정되지 않았습니다.");
    }

    await this.validateThumbnail(input.thumbnailPath);

    const statePath = await requireSession("naver");
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
    const writeUrl = PLATFORMS.naver.postWriteUrl(config.naverBlogId);
    console.log(`[네이버] 글쓰기 페이지 이동: ${writeUrl}`);

    await page.goto(writeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await humanPause(2000);

    const sel = EDITOR_SELECTORS.naver;
    const editorFrame = await this.getMainFrame(page);

    await this.dismissIfVisible(editorFrame, sel.dismissDraft);

    const titleLocator = await findContentEditable(editorFrame, sel.title);
    await humanType(titleLocator, input.title);
    await humanPause(500);

    const bodyLocator = await findContentEditable(editorFrame, sel.editorBody);
    await pasteHtmlToEditor(page, bodyLocator, input.htmlBody);
    await humanPause(1000);

    await this.uploadImage(
      editorFrame,
      input.thumbnailPath,
      sel.fileInput,
      sel.imageButton,
    );

    return this.clickPublish(
      editorFrame,
      sel.publishButton,
      sel.publishConfirm,
      page,
    );
  }

  /** #mainFrame iframe 반환 — 없으면 메인 프레임 사용 */
  private async getMainFrame(page: Page): Promise<Frame> {
    const sel = EDITOR_SELECTORS.naver;
    const iframe = page.locator(sel.mainFrame).first();

    if ((await iframe.count()) > 0) {
      const handle = await iframe.elementHandle();
      const frame = await handle?.contentFrame();
      if (frame) return frame;
    }

    return page.mainFrame();
  }
}
