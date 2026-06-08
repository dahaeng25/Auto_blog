import fs from "node:fs/promises";
import type { Frame, Page } from "playwright";

type PageOrFrame = Page | Frame;
import { config } from "../../config/index.js";
import type { PublishInput, PublishResult } from "./types.js";
import { humanClick, humanPause } from "./utils/human-input.js";

/**
 * 플랫폼 퍼블리셔 공통 베이스 클래스.
 * 썸네일 업로드, dry-run 처리 등 공유 로직을 제공합니다.
 */
export abstract class BasePublisher {
  protected abstract platformName: string;

  abstract publish(input: PublishInput): Promise<PublishResult>;

  /** 썸네일 파일 존재 확인 */
  protected async validateThumbnail(thumbnailPath: string): Promise<void> {
    try {
      await fs.access(thumbnailPath);
    } catch {
      throw new Error(`썸네일 파일을 찾을 수 없습니다: ${thumbnailPath}`);
    }
  }

  /**
   * 숨겨진 file input에 이미지를 업로드합니다.
   * 버튼 클릭이 필요한 경우 imageButtonSelector로 트리거합니다.
   */
  protected async uploadImage(
    ctx: PageOrFrame,
    thumbnailPath: string,
    fileInputSelector: string,
    imageButtonSelector?: string,
  ): Promise<void> {
    console.log(`[${this.platformName}] 썸네일 업로드 중...`);

    if (imageButtonSelector) {
      const btn = ctx.locator(imageButtonSelector).first();
      if ((await btn.count()) > 0) {
        await humanClick(btn);
        await humanPause(500);
      }
    }

    const fileInput = ctx.locator(fileInputSelector).first();
    await fileInput.waitFor({ state: "attached", timeout: 10_000 });
    await fileInput.setInputFiles(thumbnailPath);

    console.log(`[${this.platformName}] 썸네일 업로드 완료`);
    await humanPause(2000);
  }

  /** 발행 버튼 클릭 (dry-run 시 스킵) */
  protected async clickPublish(
    ctx: PageOrFrame,
    publishSelector: string,
    confirmSelector?: string,
    urlPage?: Page,
  ): Promise<string | undefined> {
    if (config.publishDryRun) {
      console.log(`[${this.platformName}] DRY-RUN: 발행 버튼 클릭 생략`);
      return undefined;
    }

    const publishBtn = ctx.locator(publishSelector).first();
    await publishBtn.waitFor({ state: "visible", timeout: 15_000 });
    await humanClick(publishBtn);
    await humanPause(1000);

    if (confirmSelector) {
      const confirmBtn = ctx.locator(confirmSelector).first();
      if ((await confirmBtn.count()) > 0) {
        await humanClick(confirmBtn);
        await humanPause(2000);
      }
    }

    return urlPage?.url() ?? ("url" in ctx ? ctx.url() : undefined);
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
    console.error(`[${this.platformName}] 실패: ${message}`);
    return {
      platform: this.getPlatform(),
      success: false,
      error: message,
    };
  }

  protected abstract getPlatform(): PublishResult["platform"];
}
