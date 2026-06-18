import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRON_SCHEDULE, CRON_TIMEZONE, RUN_ON_START } from "./cron.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const isVercel = Boolean(process.env.VERCEL);

/** Vercel/Lambda는 /var/task 가 읽기 전용 — 쓰기는 /tmp 만 가능 */
const writableRoot = isVercel
  ? path.join(os.tmpdir(), "blog-orchestrator")
  : projectRoot;

const outputDir = isVercel
  ? path.join(writableRoot, "output")
  : path.join(projectRoot, "output");

/**
 * 환경변수 기반 앱 설정.
 * Phase 1에서는 블로그 ID가 없어도 auth:setup은 동작합니다.
 */
/** 기본 RSS 피드 — RSS_FEED_URLS 환경변수로 덮어쓸 수 있음 (쉼표 구분) */
const DEFAULT_RSS_FEEDS = [
  "https://www.hankyung.com/feed/economy",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
];

export const config = {
  projectRoot,
  authDir: path.join(projectRoot, "auth"),
  outputDir,
  dataDir: path.join(projectRoot, "data"),
  dbPath: path.join(projectRoot, "data", "blog.db"),
  draftsDir: path.join(outputDir, "drafts"),
  thumbnailsDir: path.join(outputDir, "thumbnails"),
  thumbnailTemplatePath: path.join(
    projectRoot,
    "src",
    "thumbnail",
    "thumbnail-template.html",
  ),
  thumbnailBrandPath: path.join(projectRoot, "assets", "thumbnail", "brand.json"),
  blogStylePath: path.join(projectRoot, "config", "blog-style.json"),
  imageManifestPath: path.join(projectRoot, "config", "image-manifest.json"),
  imagesDir: path.join(projectRoot, "assets", "images"),
  /** true이면 썸네일에 블로그 제목 부제목도 표시 */
  thumbnailShowSubtitle: process.env.THUMBNAIL_SHOW_SUBTITLE === "true",
  /** 키워드별 AI 배경 생성 (OpenAI DALL-E) */
  thumbnailDynamicBackground: process.env.THUMBNAIL_DYNAMIC_BG !== "false",
  thumbnailBackgroundModel:
    process.env.THUMBNAIL_BG_MODEL ?? "dall-e-2",

  naverBlogId: process.env.NAVER_BLOG_ID ?? "",
  tistoryBlogName: process.env.TISTORY_BLOG_NAME ?? "",
  /** Blogger 블로그 숫자 ID (Blogger 설정 → 기본) */
  bloggerBlogId: process.env.BLOGGER_BLOG_ID ?? "",

  /** 플랫폼별 발행 on/off (Docker .env에서 조절) */
  enableNaverPublish: process.env.ENABLE_NAVER_PUBLISH !== "false",
  enableTistoryPublish: process.env.ENABLE_TISTORY_PUBLISH !== "false",
  enableGooglePublish: process.env.ENABLE_GOOGLE_PUBLISH === "true",

  /** docker | vercel | local */
  deploymentMode: (process.env.DEPLOYMENT_MODE ??
    (process.env.VERCEL ? "vercel" : "local")) as
    | "docker"
    | "vercel"
    | "local",

  /** 세션 만료 시 .env 계정으로 자동 로그인 (기본 true) */
  authAutoLogin: process.env.AUTH_AUTO_LOGIN !== "false",
  /** 자동 로그인 시 브라우저 표시 (봇 차단 완화, 기본 false=창 보임) */
  authLoginHeadless: process.env.AUTH_LOGIN_HEADLESS === "true",
  naverId: process.env.NAVER_ID ?? "",
  naverPassword: process.env.NAVER_PASSWORD ?? "",
  kakaoId: process.env.KAKAO_ID ?? "",
  kakaoPassword: process.env.KAKAO_PASSWORD ?? "",
  /** 티스토리 전용 별칭 (없으면 KAKAO_* 사용) */
  tistoryId: process.env.TISTORY_ID ?? "",
  tistoryPassword: process.env.TISTORY_PASSWORD ?? "",

  /** rss = RSS 자동 수집 | gems = 사용자 주제 + Gems 프롬프트 */
  contentMode: (process.env.CONTENT_MODE ?? "gems") as "rss" | "gems",
  /** CONTENT_MODE=gems 일 때 작성할 블로그 주제 */
  blogTopic: process.env.BLOG_TOPIC ?? "",
  /** true이면 같은 주제도 AI로 새로 생성 (기존 DB 레코드 삭제) */
  forceRegenerate: process.env.FORCE_REGENERATE === "true",
  /** true이면 published 주제도 기존 원고 재사용 후 퍼블리싱만 재시도 */
  retryPublish: process.env.RETRY_PUBLISH === "true",

  /** openai | gemini — Gems 프롬프트와 무관, API만 선택 */
  llmProvider: (process.env.LLM_PROVIDER ?? "openai") as "openai" | "gemini",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  gemsPromptPath: process.env.GEMINI_GEMS_PROMPT_PATH
    ? path.resolve(projectRoot, process.env.GEMINI_GEMS_PROMPT_PATH)
    : path.join(projectRoot, "prompts", "gems-system.prompt.md"),

  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",

  /** true이면 발행 버튼 클릭 없이 에디터 입력까지만 수행 */
  publishDryRun: process.env.PUBLISH_DRY_RUN === "true",
  /** 퍼블리싱 시 headless 모드 (디버깅 시 false 권장) */
  publishHeadless: process.env.PUBLISH_HEADLESS !== "false",
  /** true이면 썸네일 업로드 단계를 건너뜀 (에디터 입력만 테스트) */
  publishSkipThumbnail: process.env.PUBLISH_SKIP_THUMBNAIL === "true",
  /**
   * 네이버 발행 시 blue_directors 샘플 스타일·이미지 사용
   * (키워드 기반 파일명 1~N, 매번 다른 메타태그)
   */
  naverUseSampleStyle: process.env.NAVER_USE_SAMPLE_STYLE !== "false",

  rssFeedUrls: (process.env.RSS_FEED_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .concat(
      process.env.RSS_FEED_URLS ? [] : DEFAULT_RSS_FEEDS,
    ),

  cronSchedule: CRON_SCHEDULE,
  cronTimezone: CRON_TIMEZONE,
  runOnStart: RUN_ON_START,

  /** Vercel 서버리스 환경 여부 */
  isVercel,
  /** libsql DB URL — 로컬: file:./data/blog.db, Vercel: Turso URL */
  databaseUrl:
    process.env.TURSO_DATABASE_URL ??
    `file:${path.join(projectRoot, "data", "blog.db")}`,
  databaseAuthToken: process.env.TURSO_AUTH_TOKEN ?? "",

  /** 웹 서버 포트 */
  port: Number(process.env.PORT ?? 3000),
  /** Vercel Cron 보안 키 */
  cronSecret: process.env.CRON_SECRET ?? "",
  /** 웹 서버에서 cron 스케줄러 활성화 (Vercel에서는 false) */
  enableWebScheduler:
    process.env.ENABLE_WEB_SCHEDULER !== "false" && !process.env.VERCEL,
} as const;

export { PLATFORMS, type Platform } from "./platforms.js";
export {
  ALL_PLATFORMS,
  getEnabledPlatforms,
  isPlatformEnabled,
  platformBlogIdConfigured,
} from "./publish-platforms.js";
export { CRON_SCHEDULE, CRON_TIMEZONE, RUN_ON_START } from "./cron.js";
