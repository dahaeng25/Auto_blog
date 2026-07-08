import type { PublishInput, PublishResult } from "./types.js";
import { config, getEnabledPlatforms } from "../../config/index.js";
import { PLATFORMS } from "../../config/platforms.js";
import { logger } from "../monitoring/logger.js";
import { retry } from "../utils/retry.js";
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
    logger.info("═══ Phase 4: 퍼블리싱 파이프라인 ═══");

    const platforms = getEnabledPlatforms();
    if (platforms.length === 0) {
      throw new Error(
        "발행할 플랫폼이 없습니다. ENABLE_NAVER_PUBLISH / ENABLE_TISTORY_PUBLISH / ENABLE_GOOGLE_PUBLISH 중 하나 이상을 true로 설정하세요.",
      );
    }

    const results: PublishResult[] = [];

    for (const platform of platforms) {
      const name = PLATFORMS[platform].name;
      logger.info(`── ${name} 발행 시작 ──`);
      const result = await retry(
        async (attempt) => {
          if (attempt > 1) {
            logger.warn(`[${name}] 발행 재시도 ${attempt}/${config.publishRetryAttempts}`);
          }
          const r = await PUBLISHER_MAP[platform].publish(input);
          if (!r.success) {
            throw new Error(r.error ?? `${name} 발행 실패`);
          }
          return r;
        },
        {
          attempts: Math.max(1, config.publishRetryAttempts),
          initialDelayMs: Math.max(500, config.publishRetryDelayMs),
          shouldRetry: (error, attempt) => {
            const message = error instanceof Error ? error.message : String(error);
            const lower = message.toLowerCase();
            if (lower.includes("환경변수")) return false;
            if (lower.includes("설정되지 않았")) return false;
            if (lower.includes("지원하지 않")) return false;
            return attempt < Math.max(1, config.publishRetryAttempts);
          },
          onRetry: (error, attempt, nextDelayMs) => {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(
              `[${name}] 발행 실패(시도 ${attempt}) → ${nextDelayMs}ms 후 재시도: ${message}`,
            );
          },
        },
      ).catch((error) => ({
        platform,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      results.push(result);
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      const messages = failed
        .map((r) => `[${r.platform}] ${r.error}`)
        .join("\n");
      throw new Error(`퍼블리싱 실패:\n${messages}`);
    }

    logger.info("✅ 모든 플랫폼 퍼블리싱 완료");
    for (const r of results) {
      if (r.postUrl) {
        logger.info(`   [${r.platform}] 발행 URL → ${r.postUrl}`);
      } else {
        logger.info(
          `   [${r.platform}] DRY-RUN — 발행 URL 없음 (에디터 입력만 완료)`,
        );
      }
    }

    return results;
  }
}
