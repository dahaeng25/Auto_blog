import type { PublishInput, PublishResult } from "./types.js";
import { NaverPublisher } from "./naver-publisher.js";
import { TistoryPublisher } from "./tistory-publisher.js";

export interface PublishPipelineOptions {
  /** 네이버 발행 스킵 */
  skipNaver?: boolean;
  /** 티스토리 발행 스킵 */
  skipTistory?: boolean;
}

/**
 * Phase 4 퍼블리싱 파이프라인.
 * 네이버 → 티스토리 순서로 발행합니다.
 */
export class PublishPipeline {
  private readonly naver = new NaverPublisher();
  private readonly tistory = new TistoryPublisher();

  async run(
    input: PublishInput,
    options: PublishPipelineOptions = {},
  ): Promise<PublishResult[]> {
    console.log("\n═══ Phase 4: 퍼블리싱 파이프라인 ═══\n");

    const results: PublishResult[] = [];

    if (!options.skipNaver) {
      console.log("── 네이버 발행 시작 ──");
      results.push(await this.naver.publish(input));
    }

    if (!options.skipTistory) {
      console.log("── 티스토리 발행 시작 ──");
      results.push(await this.tistory.publish(input));
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      const messages = failed.map((r) => `[${r.platform}] ${r.error}`).join("\n");
      throw new Error(`퍼블리싱 실패:\n${messages}`);
    }

    console.log("\n✅ 모든 플랫폼 퍼블리싱 완료");
    for (const r of results) {
      if (r.postUrl) {
        console.log(`   [${r.platform}] 발행 URL → ${r.postUrl}`);
      } else {
        console.log(`   [${r.platform}] DRY-RUN — 발행 URL 없음 (에디터 입력만 완료)`);
      }
    }

    return results;
  }
}
