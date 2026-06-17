import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRON_SCHEDULE, CRON_TIMEZONE, RUN_ON_START } from "./cron.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
  outputDir: path.join(projectRoot, "output"),
  dataDir: path.join(projectRoot, "data"),
  dbPath: path.join(projectRoot, "data", "blog.db"),
  draftsDir: path.join(projectRoot, "output", "drafts"),
  thumbnailsDir: path.join(projectRoot, "output", "thumbnails"),
  thumbnailTemplatePath: path.join(
    projectRoot,
    "src",
    "thumbnail",
    "thumbnail-template.html",
  ),

  naverBlogId: process.env.NAVER_BLOG_ID ?? "",
  tistoryBlogName: process.env.TISTORY_BLOG_NAME ?? "",

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",

  /** true이면 발행 버튼 클릭 없이 에디터 입력까지만 수행 */
  publishDryRun: process.env.PUBLISH_DRY_RUN === "true",
  /** 퍼블리싱 시 headless 모드 (디버깅 시 false 권장) */
  publishHeadless: process.env.PUBLISH_HEADLESS !== "false",

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
  isVercel: Boolean(process.env.VERCEL),
  /** libsql DB URL — 로컬: file:./data/blog.db, Vercel: Turso URL */
  databaseUrl:
    process.env.TURSO_DATABASE_URL ??
    `file:${path.join(projectRoot, "data", "blog.db")}`,
  databaseAuthToken: process.env.TURSO_AUTH_TOKEN ?? "",

  /** 웹 서버 포트 */
  port: Number(process.env.PORT ?? 3000),
  /** API 인증 키 (미설정 시 로컬 개발 모드) */
  apiKey: process.env.API_KEY ?? "",
  /** Vercel Cron 보안 키 */
  cronSecret: process.env.CRON_SECRET ?? "",
  /** 웹 서버에서 cron 스케줄러 활성화 (Vercel에서는 false) */
  enableWebScheduler:
    process.env.ENABLE_WEB_SCHEDULER !== "false" && !process.env.VERCEL,
} as const;

export { PLATFORMS, type Platform } from "./platforms.js";
export { CRON_SCHEDULE, CRON_TIMEZONE, RUN_ON_START } from "./cron.js";
