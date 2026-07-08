import fs from "node:fs/promises";
import type { Frame, Page } from "playwright";
import { config } from "../../config/index.js";
import { logger } from "../monitoring/logger.js";
import type { PublishInput, PublishResult } from "./types.js";
import { humanClick, humanPause } from "./utils/human-input.js";
import {
  toSelectorArray,
  uploadImageRobust,
} from "./utils/image-upload.js";
import { clickPublishButton } from "./utils/publish-click.js";

type PageOrFrame = Page | Frame;

/**
 * 플랫폼 퍼블리셔 공통 베이스 클래스.
 * 썸네일 업로드, dry-run 처리 등 공유 로직을 제공합니다.
 */
export abstract class BasePublisher {
  protected abstract platformName: string;

  abstract publish(input: PublishInput): Promise<PublishResult>;

  /** 썸네일 파일 존재 확인 (skip 옵션 시 생략) */
  protected async validateThumbnail(thumbnailPath: string): Promise<void> {
    if (config.publishSkipThumbnail) return;

    try {
      await fs.access(thumbnailPath);
    } catch {
      throw new Error(`썸네일 파일을 찾을 수 없습니다: ${thumbnailPath}`);
    }
  }

  /**
   * 썸네일 이미지 업로드.
   * filechooser 이벤트 + 전체 frame 탐색으로 안정적으로 처리합니다.
   */
  protected async uploadImage(
    page: Page,
    thumbnailPath: string,
    contexts: PageOrFrame[],
    imageButtonSelector: string,
    fileInputSelector: string,
  ): Promise<void> {
    if (config.publishSkipThumbnail) {
      logger.info(`[${this.platformName}] PUBLISH_SKIP_THUMBNAIL=true — 썸네일 업로드 생략`);
      return;
    }

    try {
      await uploadImageRobust({
        page,
        imagePath: thumbnailPath,
        contexts: [page, ...contexts, ...page.frames()],
        imageButtonSelectors: toSelectorArray(imageButtonSelector),
        fileInputSelectors: toSelectorArray(fileInputSelector),
        platformName: this.platformName,
        label: "썸네일",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[${this.platformName}] 썸네일 업로드 실패 — 건너뜀: ${msg}`);
    }
  }

  /** 발행 버튼 클릭 — page + 모든 frame에서 visible 버튼 탐색 */
  protected async clickPublish(
    page: Page,
    contexts: PageOrFrame[],
    publishSelector: string,
    confirmSelector?: string,
  ): Promise<string | undefined> {
    return clickPublishButton({
      page,
      contexts,
      publishSelectors: publishSelector,
      confirmSelectors: confirmSelector,
      platformName: this.platformName,
      platform: this.getPlatform(),
    });
  }

  /** 팝업/다이얼로그가 있으면 클릭 */
  protected async dismissIfVisible(
    ctx: PageOrFrame,
    selector: string,
    timeoutMs = 3000,
  ): Promise<void> {
    const locator = ctx.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      await humanClick(locator);
      await humanPause(500);
    } catch {
      // 팝업 없음 — 무시
    }
  }

  protected successResult(postUrl?: string): PublishResult {
    return {
      platform: this.getPlatform(),
      success: true,
      postUrl,
    };
  }

  protected failResult(error: unknown): PublishResult {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${this.platformName}] 실패: ${message}`);
    return {
      platform: this.getPlatform(),
      success: false,
      error: message,
    };
  }

  protected abstract getPlatform(): PublishResult["platform"];
}
