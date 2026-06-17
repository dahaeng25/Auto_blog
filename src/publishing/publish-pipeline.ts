import type { PublishInput, PublishResult } from "./types.js";
import { getEnabledPlatforms } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { GooglePublisher } from "./google-publisher.js";
import { NaverPublisher } from "./naver-publisher.js";
import { TistoryPublisher } from "./tistory-publisher.js";

const PUBLISHER_MAP = {
  naver: new NaverPublisher(),
  tistory: new TistoryPublisher(),
  google: new GooglePublisher(),
} as const;

/**
 * Phase 4 퍼블리싱 파이프라인.
 * ENABLE_*_PUBLISH 환경 변수로 켜진 플랫폼만 순서대로 발행합니다.
 */
export class PublishPipeline {
  async run(input: PublishInput): Promise<PublishResult[]> {
    console.log("\n═══ Phase 4: 퍼블리싱 파이프라인 ═══\n");

    const platforms = getEnabledPlatforms();
    if (platforms.length === 0) {
      throw new Error(
        "발행할 플랫폼이 없습니다. ENABLE_NAVER_PUBLISH / ENABLE_TISTORY_PUBLISH / ENABLE_GOOGLE_PUBLISH 중 하나 이상을 true로 설정하세요.",
      );
    }

    const results: PublishResult[] = [];

    for (const platform of platforms) {
      const name = PLATFORMS[platform].name;
      console.log(`── ${name} 발행 시작 ──`);
      results.push(await PUBLISHER_MAP[platform].publish(input));
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      const messages = failed
        .map((r) => `[${r.platform}] ${r.error}`)
        .join("\n");
      throw new Error(`퍼블리싱 실패:\n${messages}`);
    }

    console.log("\n✅ 모든 플랫폼 퍼블리싱 완료");
    for (const r of results) {
      if (r.postUrl) {
        console.log(`   [${r.platform}] 발행 URL → ${r.postUrl}`);
      } else {
        console.log(
          `   [${r.platform}] DRY-RUN — 발행 URL 없음 (에디터 입력만 완료)`,
        );
      }
    }

    return results;
  }
}
