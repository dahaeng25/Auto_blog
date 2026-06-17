import { config } from "../../config/index.js";
import {
  getEnabledPlatforms,
  isPlatformEnabled,
  platformBlogIdConfigured,
} from "../../config/publish-platforms.js";
import { PLATFORMS } from "../../config/platforms.js";
import { hasSession } from "../auth/session-manager.js";

export interface PreflightOptions {
  blogTopic?: string;
}

/**
 * 파이프라인 실행 전 필수 조건을 검사합니다.
 */
export async function assertOrchestrationReady(
  options: PreflightOptions = {},
): Promise<void> {
  const errors: string[] = [];
  const envHint =
    config.deploymentMode === "docker"
      ? ".env 또는 docker-compose 환경 변수"
      : config.isVercel
        ? "Vercel Environment Variables"
        : ".env 파일";

  const topic = (options.blogTopic ?? config.blogTopic).trim();
  if (config.contentMode === "gems" && !topic) {
    errors.push(
      `블로그 주제가 필요합니다. 대시보드 입력란에 주제를 입력하거나 ${envHint}에 BLOG_TOPIC을 설정하세요.`,
    );
  }

  if (config.llmProvider === "openai" && !config.openaiApiKey) {
    errors.push(
      `OPENAI_API_KEY가 설정되지 않았습니다. ${envHint}에서 추가하세요.`,
    );
  } else if (config.llmProvider === "gemini" && !config.geminiApiKey) {
    errors.push(
      `GEMINI_API_KEY가 설정되지 않았습니다. ${envHint}에서 추가하세요.`,
    );
  }

  const enabled = getEnabledPlatforms();
  if (enabled.length === 0) {
    errors.push(
      "발행 플랫폼이 하나도 활성화되지 않았습니다. ENABLE_NAVER_PUBLISH / ENABLE_TISTORY_PUBLISH / ENABLE_GOOGLE_PUBLISH 를 확인하세요.",
    );
  }

  if (!config.publishDryRun) {
    for (const platform of enabled) {
      if (!platformBlogIdConfigured(platform)) {
        const envName =
          platform === "naver"
            ? "NAVER_BLOG_ID"
            : platform === "tistory"
              ? "TISTORY_BLOG_NAME"
              : "BLOGGER_BLOG_ID";
        errors.push(`${envName} 환경 변수가 설정되지 않았습니다.`);
      }

      if (!(await hasSession(platform))) {
        errors.push(
          `${PLATFORMS[platform].name} 세션이 없습니다. npm run auth:setup 실행 후 auth/${platform}_state.json 이 생성됐는지 확인하세요.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n\n"));
  }
}

/** 대시보드용 — 활성 플랫폼 목록 */
export { getEnabledPlatforms, isPlatformEnabled };
