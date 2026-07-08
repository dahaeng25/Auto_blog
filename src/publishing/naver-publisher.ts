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
import {
  findNaverTitleField,
  findNaverBodyField,
  fillNaverTitle,
} from "./utils/naver-editor.js";
import { assertEditorAccessible } from "../auth/login-check.js";
import {
  navigateToWritePage,
  normalizeNaverBlogId,
  normalizeTistoryBlogName,
} from "../auth/write-page-nav.js";
import {
  dismissNaverDraftDialog,
  waitForNaverEditorReady,
} from "./utils/naver-draft-handler.js";
import { dismissNaverRightPanel } from "./utils/naver-sidebar-handler.js";
import { logger } from "../monitoring/logger.js";

/**
 * 네이버 블로그 스마트에디터 ONE 퍼블리셔.
 * 제목란과 본문란을 분리하여 입력합니다.
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

    const statePath = await ensureValidSession("naver");
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
      "naver",
      normalizeNaverBlogId(config.naverBlogId),
    );
    logger.info(`[네이버] 글쓰기 페이지 이동: ${writeUrl}`);

    await assertEditorAccessible(page, "naver");
    await waitForNaverEditorReady(page);

    const sel = EDITOR_SELECTORS.naver;

    await dismissNaverDraftDialog(page);
    await dismissNaverRightPanel(page);

    const editorFrame = await this.getMainFrame(page);

    // 1) 제목란에 제목만 입력
    const titleLocator = await findNaverTitleField(editorFrame);
    await fillNaverTitle(titleLocator, input.title);

    // 2) 본문란 탐색 (제목 입력 후 본문 영역이 활성화될 때까지 대기)
    await humanPause(1000);
    const bodyLocator = await findNaverBodyField(editorFrame);
    await fillBodyWithImages({
      page,
      platform: "naver",
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

    // 글 작성 완료 후 우측 패널이 다시 열렸을 수 있음 → 발행 전 닫기
    await dismissNaverRightPanel(page);

    return this.clickPublish(
      page,
      [page, editorFrame],
      sel.publishButton,
      sel.publishConfirm,
    );
  }

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
