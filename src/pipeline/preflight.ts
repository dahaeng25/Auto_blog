import { config } from "../../config/index.js";
import { hasSession } from "../auth/session-manager.js";

export interface PreflightOptions {
  blogTopic?: string;
}

/**
 * 파이프라인 실행 전 필수 조건을 검사합니다.
 * Vercel에서 흔한 실패(키·세션·주제 누락)를 조기에 안내합니다.
 */
export async function assertOrchestrationReady(
  options: PreflightOptions = {},
): Promise<void> {
  const errors: string[] = [];

  const topic = (options.blogTopic ?? config.blogTopic).trim();
  if (config.contentMode === "gems" && !topic) {
    errors.push(
      "블로그 주제가 필요합니다. 대시보드 입력란에 주제를 입력하거나 Vercel에 BLOG_TOPIC을 설정하세요.",
    );
  }

  if (config.llmProvider === "openai" && !config.openaiApiKey) {
    errors.push(
      "OPENAI_API_KEY 환경 변수가 설정되지 않았습니다. Vercel → Settings → Environment Variables에서 추가하세요.",
    );
  } else if (config.llmProvider === "gemini" && !config.geminiApiKey) {
    errors.push(
      "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. Vercel → Settings → Environment Variables에서 추가하세요.",
    );
  }

  if (!config.publishDryRun) {
    if (!config.naverBlogId) {
      errors.push("NAVER_BLOG_ID 환경 변수가 설정되지 않았습니다.");
    }
    if (!config.tistoryBlogName) {
      errors.push("TISTORY_BLOG_NAME 환경 변수가 설정되지 않았습니다.");
    }

    const [naver, tistory] = await Promise.all([
      hasSession("naver"),
      hasSession("tistory"),
    ]);

    if (!naver) {
      errors.push(
        "네이버 세션이 없습니다. 로컬에서 npm run auth:setup 후 생성된 naver-state.json을 대시보드에서 업로드하세요.",
      );
    }
    if (!tistory) {
      errors.push(
        "티스토리 세션이 없습니다. 로컬에서 npm run auth:setup 후 생성된 tistory-state.json을 대시보드에서 업로드하세요.",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n\n"));
  }
}
