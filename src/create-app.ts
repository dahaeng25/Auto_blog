import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { config, getEnabledPlatforms } from "../config/index.js";
import { PLATFORMS, type Platform } from "../config/platforms.js";
import {
  connectInputStore,
  type ConnectInputAction,
} from "./api/connect-input-store.js";
import { connectJobStore } from "./api/connect-job-store.js";
import { jobStore } from "./api/job-store.js";
import { readRecentLogs } from "./api/log-reader.js";
import { hasSession } from "./auth/session-manager.js";
import {
  getAllSessionInfo,
  getSessionInfo,
  markSessionVerified,
  validateStorageState,
  verifySessionQuick,
} from "./auth/session-info.js";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSession,
  destroySession,
  getSessionTokenFromRequest,
  loginUser,
  resolveSessionUser,
  signupUser,
} from "./auth/user-auth.js";
import {
  enterUserContext,
  runWithUser,
  type AuthUser,
} from "./auth/user-context.js";
import { TopicRepository } from "./content/farming/topic-repository.js";
import type { TopicStatus } from "./content/types.js";
import { PublishedPostRepository } from "./content/seo/published-post-repository.js";
import { loadBlogStyle } from "./content/blog-style/load-style.js";
import { buildArticlePreviewHtml } from "./api/article-preview-html.js";
import { ensureSchema } from "./db/migrate.js";
import { useLibsql } from "./db/client.js";
import { readLocalizedTextFileSync } from "./fs/read-localized-text-file.js";
import { logger } from "./monitoring/logger.js";
import { isPipelineRunning, runOrchestration, runPipelineStep } from "./pipeline.js";
import type { PipelineStep } from "./pipeline.js";
import { saveStoredSession, deleteStoredSession } from "./storage/session-store.js";
import { hasEnvCredentials } from "./auth/platform-credentials.js";
import {
  clearThumbnailBackground,
  getThumbnailBackgroundStatus,
  getUploadedBackgroundBuffer,
  listSampleBackgrounds,
  saveSampleThumbnailBackground,
  saveUploadedThumbnailBackground,
} from "./storage/thumbnail-background-store.js";

export interface CreateAppOptions {
  /** 정적 대시보드 서빙 (Docker/로컬) */
  serveStatic?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

const PUBLIC_API_PATHS = new Set([
  "/health",
  "/api/health",
  "/api/meta",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/me",
]);

async function getAllSessionStatus(): Promise<Record<Platform, boolean>> {
  const platforms = Object.keys(PLATFORMS) as Platform[];
  const entries = await Promise.all(
    platforms.map(async (platform) => [platform, await hasSession(platform)] as const),
  );
  return Object.fromEntries(entries) as Record<Platform, boolean>;
}

async function getAllSessionDetails() {
  return getAllSessionInfo();
}

function readFirstNonCommentLine(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const raw = readLocalizedTextFileSync(filePath);
  return (
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? ""
  );
}

function isPublicPath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  if (PUBLIC_API_PATHS.has(pathname)) return true;
  if (pathname === "/api/auth/logout") return true;
  // 정적 파일·루트는 공개 (프론트에서 로그인 게이트)
  if (!pathname.startsWith("/api/")) return true;
  return false;
}

function isAuthContextError(message: string): boolean {
  return (
    /인증된 사용자가 없습니다/i.test(message) ||
    /runWithUser로 userId/i.test(message) ||
    /로그인이 필요합니다/i.test(message)
  );
}

function isLikelyDbConnectionError(message: string): boolean {
  return (
    /TURSO_/i.test(message) ||
    /libsql/i.test(message) ||
    /DATABASE_URL/i.test(message) ||
    /AUTH_TOKEN/i.test(message) ||
    /Unable to connect/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /fetch failed/i.test(message) ||
    /SQLITE_CANTOPEN/i.test(message) ||
    /DB 초기화 실패/i.test(message)
  );
}

export async function createApp(
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const { serveStatic = true } = options;
  const app = Fastify({
    logger: false,
    /** 썸네일 배경 업로드(base64 JSON)용 — 기본 1MB보다 크게 */
    bodyLimit: 3 * 1024 * 1024,
  });

  await ensureSchema().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `DB 초기화 실패: ${message}\n` +
        (useLibsql()
          ? "Turso(TURSO_DATABASE_URL) 연결을 확인하세요."
          : "npm install better-sqlite3 실행 후 data/ 폴더 쓰기 권한을 확인하세요."),
    );
  });

  // resolve 후 run(user, done) — done 자체를 ALS 콜백으로 넘겨
  // Fastify 이후 훅/핸들러가 같은 async context 를 이어받게 함.
  // (enterWith 및 run(() => done()) 은 Vercel inject 에서 끊길 수 있음)
  app.addHook("onRequest", (request, reply, done) => {
    void (async () => {
      try {
        const token = getSessionTokenFromRequest(request.headers);
        const sessionUser = await resolveSessionUser(token);
        if (sessionUser) {
          const user: AuthUser = {
            id: sessionUser.id,
            username: sessionUser.username,
          };
          request.authUser = user;
          runWithUser(user, done);
          return;
        }

        if (!isPublicPath(request.url)) {
          reply.status(401).send({ error: "로그인이 필요합니다." });
          return;
        }
        done();
      } catch (error) {
        done(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/meta", async () => ({
    version: "0.4.0",
    platform: config.deploymentMode,
    auth: "session",
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 8) ??
      null,
  }));

  app.post("/api/auth/signup", async (request, reply) => {
    try {
      const body =
        (request.body as { username?: string; password?: string } | undefined) ??
        {};
      const result = await signupUser(body.username ?? "", body.password ?? "");
      if ("error" in result) {
        return reply.status(400).send({ error: result.error });
      }

      const session = await createSession(result.user.id);
      reply.header("Set-Cookie", buildSessionCookie(session.token));
      return { ok: true, user: result.user };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        error: `회원가입 처리 중 오류: ${message}`,
      });
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    try {
      const body =
        (request.body as { username?: string; password?: string } | undefined) ??
        {};
      const result = await loginUser(body.username ?? "", body.password ?? "");
      if ("error" in result) {
        return reply.status(401).send({ error: result.error });
      }
      reply.header("Set-Cookie", buildSessionCookie(result.token));
      return { ok: true, user: result.user };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        error: `로그인 처리 중 오류: ${message}`,
      });
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getSessionTokenFromRequest(request.headers);
    if (token) await destroySession(token);
    reply.header("Set-Cookie", buildClearSessionCookie());
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    if (!request.authUser) {
      return { authenticated: false, user: null };
    }
    return {
      authenticated: true,
      user: request.authUser,
    };
  });

  app.get("/api/status", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }

    const loadStatus = async () => {
      // jobStore.get() 는 stale running 을 error 로 정리한다.
      // Vercel은 인스턴스가 달라 메모리 락이 false 여도 DB running 이면 실행 중으로 본다.
      const job = await jobStore.get();
      const isRunning = isPipelineRunning() || job.status === "running";
      return {
        job,
        isRunning,
        user,
        config: {
          cronSchedule: config.cronSchedule,
          cronTimezone: config.cronTimezone,
          publishDryRun: config.publishDryRun,
          publishHeadless: config.publishHeadless,
          blogTopic: config.blogTopic || null,
          naverBlogId: config.naverBlogId || null,
          tistoryBlogName: config.tistoryBlogName || null,
          bloggerBlogId: config.bloggerBlogId || null,
          enabledPlatforms: getEnabledPlatforms(),
          contentMode: config.contentMode,
          deploymentMode: config.deploymentMode,
          rssFeedCount: config.rssFeedUrls.length,
          isVercel: config.isVercel,
          minPlainTextChars: loadBlogStyle().structure.minPlainTextChars ?? 3500,
          envLoginAvailable: {
            naver: hasEnvCredentials("naver"),
            tistory: hasEnvCredentials("tistory"),
          },
          connectFeatures: {
            headedManualLogin: !config.isVercel,
            loginPreview: config.isVercel,
          },
        },
        sessions: await getAllSessionStatus(),
        sessionDetails: await getAllSessionDetails(),
        connectJobs: await connectJobStore.getMany(["naver", "tistory"]),
      };
    };

    try {
      // 훅 ALS 유실 대비 — request.authUser 기준으로 한 번 더 감쌈
      return await runWithUser(user, loadStatus);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({
          error: "로그인이 필요합니다.",
          detail: message,
        });
      }
      if (isLikelyDbConnectionError(message)) {
        return reply.status(503).send({
          error:
            "데이터베이스 연결 실패. Vercel에 TURSO_DATABASE_URL, TURSO_AUTH_TOKEN을 설정했는지 확인하세요.",
          detail: message,
        });
      }
      return reply.status(500).send({
        error: `상태 조회 실패: ${message}`,
        detail: message,
      });
    }
  });

  app.post("/api/run", async (request, reply) => {
    if (isPipelineRunning() || (await jobStore.isRunning())) {
      return reply.status(409).send({
        error: "파이프라인이 이미 실행 중입니다.",
        job: await jobStore.get(),
      });
    }

    const body =
      (request.body as
        | { trigger?: string; blogTopic?: string; blogRegion?: string }
        | undefined) ?? {};
    const trigger = body.trigger ?? "web";
    const blogTopic = body.blogTopic?.trim() || undefined;
    const blogRegion = body.blogRegion?.trim() || undefined;
    const user = request.authUser!;

    // Vercel 서버리스: 함수 종료 전까지 파이프라인 완료 대기
    if (config.isVercel) {
      try {
        enterUserContext(user);
        const result = await runOrchestration({
          trigger,
          blogTopic,
          blogRegion,
        });
        return {
          message: "파이프라인이 완료되었습니다.",
          job: await jobStore.get(),
          title: result.draft.title,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stage =
          error instanceof Error && "pipelineStage" in error
            ? error.pipelineStage === "publish"
              ? "발행"
              : String((error as Error & { pipelineStage?: string }).pipelineStage)
            : undefined;
        return reply.status(500).send({
          error: message,
          stage,
          job: await jobStore.get(),
        });
      }
    }

    // 백그라운드 실행 — ALS 유실 방지를 위해 runWithUser로 감쌈
    void runWithUser(user, () =>
      runOrchestration({ trigger, blogTopic, blogRegion }),
    ).catch(() => {});

    return reply.status(202).send({
      message: "파이프라인 실행을 시작했습니다.",
      job: await jobStore.get(),
    });
  });

  app.post("/api/run/step", async (request, reply) => {
    if (isPipelineRunning() || (await jobStore.isRunning())) {
      return reply.status(409).send({
        error: "파이프라인이 이미 실행 중입니다.",
        job: await jobStore.get(),
      });
    }

    const body =
      (request.body as
        | {
            step?: PipelineStep;
            trigger?: string;
            blogTopic?: string;
            blogRegion?: string;
          }
        | undefined) ?? {};

    const step = body.step;
    if (
      !step ||
      !["collect", "content", "thumbnail", "publish"].includes(step)
    ) {
      return reply.status(400).send({
        error: "step은 collect | content | thumbnail | publish 중 하나여야 합니다.",
      });
    }

    const trigger = body.trigger ?? `web-step:${step}`;
    const blogTopic = body.blogTopic?.trim() || undefined;
    const blogRegion = body.blogRegion?.trim() || undefined;
    const user = request.authUser!;

    if (config.isVercel) {
      try {
        enterUserContext(user);
        const result = await runPipelineStep({
          step,
          trigger,
          blogTopic,
          blogRegion,
        });
        return {
          message: `${step} 단계가 완료되었습니다.`,
          step: result.step,
          title: result.title ?? result.topicTitle,
          thumbnailPath: result.thumbnailPath,
          job: await jobStore.get(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stage =
          step === "publish"
            ? "발행"
            : step === "thumbnail"
              ? "썸네일"
              : step === "collect"
                ? "수집"
                : "생성";
        return reply.status(500).send({
          error: message,
          stage,
          job: await jobStore.get(),
        });
      }
    }

    void runWithUser(user, () =>
      runPipelineStep({ step, trigger, blogTopic, blogRegion }),
    ).catch(() => {});

    return reply.status(202).send({
      message: `${step} 단계 실행을 시작했습니다.`,
      job: await jobStore.get(),
    });
  });

  app.get("/api/topics", async (request) => {
    const query = request.query as { status?: TopicStatus; limit?: string };
    const repo = new TopicRepository();
    try {
      const limit = query.limit ? Number(query.limit) : 50;
      return await repo.listTopics({
        status: query.status,
        limit: Number.isFinite(limit) ? limit : 50,
      });
    } finally {
      repo.close();
    }
  });

  app.get("/api/articles", async (request) => {
    const query = request.query as { limit?: string };
    const repo = new TopicRepository();
    try {
      const limit = query.limit ? Number(query.limit) : 20;
      return await repo.listArticles(Number.isFinite(limit) ? limit : 20);
    } finally {
      repo.close();
    }
  });

  app.post("/api/articles/clear", async () => {
    const repo = new TopicRepository();
    try {
      const result = await repo.clearArticles();
      return {
        ok: true,
        deletedArticles: result.deletedArticles,
        resetTopics: result.resetTopics,
        message: `원고 ${result.deletedArticles}건 삭제, drafted 주제 ${result.resetTopics}건을 farmed로 복원했습니다.`,
      };
    } finally {
      repo.close();
    }
  });

  app.get("/api/articles/:id/preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    const articleId = Number(id);
    if (!Number.isFinite(articleId) || articleId <= 0) {
      return reply.status(400).send({ error: "잘못된 원고 ID입니다." });
    }

    const repo = new TopicRepository();
    try {
      const article = await repo.getArticleById(articleId);
      if (!article) {
        return reply.status(404).send({ error: "원고를 찾을 수 없습니다." });
      }

      const html = buildArticlePreviewHtml(article.title, article.htmlBody);
      return reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .send(html);
    } finally {
      repo.close();
    }
  });

  app.get("/api/articles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = new TopicRepository();
    try {
      const article = await repo.getArticleById(Number(id));
      if (!article) {
        return reply.status(404).send({ error: "원고를 찾을 수 없습니다." });
      }
      return article;
    } finally {
      repo.close();
    }
  });

  app.get("/api/stats", async () => {
    const repo = new TopicRepository();
    try {
      return await repo.getStats();
    } finally {
      repo.close();
    }
  });

  app.get("/api/logs", async (request) => {
    const query = request.query as { lines?: string };
    const lines = query.lines ? Number(query.lines) : 200;
    return {
      lines: readRecentLogs(Number.isFinite(lines) ? lines : 200),
    };
  });

  app.get("/api/input-history", async () => {
    const keywords = readFirstNonCommentLine(
      path.join(config.projectRoot, "blog-keywords.txt"),
    );
    const region = readFirstNonCommentLine(
      path.join(config.projectRoot, "blog-region.txt"),
    );

    return {
      keywords: keywords ? [keywords] : [],
      regions: region ? [region] : [],
    };
  });

  app.get("/api/published-posts", async (request) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 20;
    const repo = new PublishedPostRepository();
    try {
      return await repo.listRecent(Number.isFinite(limit) ? limit : 20);
    } finally {
      repo.close();
    }
  });

  app.get("/api/sessions", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    return runWithUser(user, () => getAllSessionStatus());
  });
  app.get("/api/sessions/status", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    return runWithUser(user, async () => ({
      sessionDetails: await getAllSessionDetails(),
      connectJobs: await connectJobStore.getMany(["naver", "tistory"]),
    }));
  });

  app.post("/api/sessions/:platform", async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const user = request.authUser;

    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }

    if (platform !== "naver" && platform !== "tistory") {
      return reply.status(400).send({
        error:
          "대시보드 세션 업로드는 네이버·티스토리만 지원합니다.",
      });
    }

    if (!(platform in PLATFORMS)) {
      return reply.status(400).send({ error: "지원하지 않는 플랫폼입니다." });
    }

    const body = request.body;
    const validated = validateStorageState(body);
    if (!validated.ok) {
      return reply.status(400).send({ error: validated.error });
    }

    const quick = verifySessionQuick(platform, validated.state);
    if (quick.valid === "expired") {
      return reply.status(400).send({
        error: `${quick.message}. 대시보드 「계정 연결」에서 다시 로그인해 주세요.`,
      });
    }

    const json = JSON.stringify(validated.state);
    try {
      await runWithUser(user, async () => {
        await saveStoredSession(platform as Platform, json);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      if (isLikelyDbConnectionError(message)) {
        return reply.status(503).send({
          error:
            "세션 저장 실패. Vercel에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 이 설정됐는지 확인하세요.",
          detail: message,
        });
      }
      return reply.status(500).send({
        error: `세션 저장에 실패했습니다: ${message}`,
        detail: message,
      });
    }

    logger.info(`세션 업로드 완료: ${platform} (user=${user.id})`);
    const session = await runWithUser(user, () =>
      getSessionInfo(platform as Platform),
    );
    return { ok: true, platform, session };
  });

  app.post("/api/sessions/:platform/refresh", async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    if (platform !== "naver" && platform !== "tistory") {
      return reply.status(400).send({
        error: "네이버·티스토리만 웹에서 연결할 수 있습니다.",
      });
    }
    if (!(platform in PLATFORMS)) {
      return reply.status(400).send({ error: "지원하지 않는 플랫폼입니다." });
    }

    const body =
      (request.body as
        | {
            username?: string;
            password?: string;
            force?: boolean;
            manual?: boolean;
            /** start: 작업 등록 / run: Playwright 실행 / input: 원격 화면 조작 */
            phase?: "start" | "run" | "input";
            action?: unknown;
          }
        | undefined) ?? {};

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const hasFormCreds = Boolean(username && password);
    const credentials = hasFormCreds
      ? { id: username, password }
      : undefined;
    const phase =
      body.phase === "run" || body.phase === "input" ? body.phase : "start";
    const manual = body.manual === true;

    const target = platform as Platform;

    if (phase === "input") {
      const rawAction = body.action as Record<string, unknown> | null;
      let action: ConnectInputAction | null = null;
      if (
        rawAction?.type === "click" &&
        typeof rawAction.x === "number" &&
        Number.isFinite(rawAction.x) &&
        typeof rawAction.y === "number" &&
        Number.isFinite(rawAction.y)
      ) {
        action = {
          type: "click",
          x: Math.max(0, Math.min(1, rawAction.x)),
          y: Math.max(0, Math.min(1, rawAction.y)),
        };
      } else if (
        rawAction?.type === "type" &&
        typeof rawAction.text === "string" &&
        rawAction.text.length > 0 &&
        rawAction.text.length <= 500
      ) {
        action = { type: "type", text: rawAction.text };
      } else if (
        rawAction?.type === "press" &&
        ["Enter", "Tab", "Backspace", "Escape"].includes(
          String(rawAction.key),
        )
      ) {
        action = {
          type: "press",
          key: String(rawAction.key) as
            | "Enter"
            | "Tab"
            | "Backspace"
            | "Escape",
        };
      } else if (rawAction?.type === "confirm") {
        const text =
          typeof rawAction.text === "string" ? rawAction.text.trim() : "";
        if (text.length > 500) {
          action = null;
        } else {
          action = text ? { type: "confirm", text } : { type: "confirm" };
        }
      }

      if (!action) {
        return reply.status(400).send({ error: "올바르지 않은 화면 조작입니다." });
      }

      return runWithUser(user, async () => {
        const current = await connectJobStore.get(target);
        if (current.status !== "connecting" || !current.interactive) {
          return reply.status(409).send({
            error: "현재 조작할 수 있는 로그인 화면이 없습니다.",
          });
        }
        await connectInputStore.enqueue(target, action);
        return reply.status(202).send({ ok: true, accepted: true });
      });
    }

    if (!hasFormCreds && !hasEnvCredentials(platform as Platform) && !manual) {
      return reply.status(400).send({
        error:
          "아이디와 비밀번호를 입력해 주세요. (또는 서버에 계정 환경변수를 설정하세요)",
      });
    }

    const runConnect = async () => {
      try {
        const { ensureValidSession } = await import("./auth/ensure-session.js");
        await ensureValidSession(target, {
          forceRelogin: body.force === true || hasFormCreds || manual,
          credentials,
          manual,
        });
        // ensureValidSession(강제 로그인)이 이미 글쓰기 화면까지 확인함 — 추가 Chromium 검증 생략
        markSessionVerified(target);
        const session = await getSessionInfo(target);
        await connectJobStore.markConnected(target);
        return { ok: true as const, platform: target, session };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await connectJobStore.markFailed(target, message);
        throw error;
      }
    };

    try {
      if (phase === "start") {
        return await runWithUser(user, async () => {
          await connectJobStore.markConnecting(
            target,
            manual ? "manual" : "auto",
          );

          // 로컬: 백그라운드 실행 후 즉시 202
          // Vercel: refresh.ts 핸들러가 waitUntil 로 phase=run 을 이어서 실행
          if (!config.isVercel) {
            void runWithUser(user, runConnect).catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error);
              logger.error(`계정 연결 실패 (${target}): ${message}`);
            });
          }

          return reply.status(202).send({
            ok: true,
            accepted: true,
            status: "connecting",
            platform: target,
            message: "연결을 시작했습니다.",
            /** Vercel은 응답 후 백그라운드 불가 → 클라이언트가 phase=run 호출 */
            needsClientRun: config.isVercel,
            connectJob: await connectJobStore.get(target),
          });
        });
      }

      // phase === "run"
      return await runWithUser(user, async () => {
        const current = await connectJobStore.get(target);
        if (current.status !== "connecting") {
          await connectJobStore.markConnecting(
            target,
            manual ? "manual" : "auto",
          );
        }
        const result = await runConnect();
        return {
          ...result,
          status: "connected" as const,
          connectJob: await connectJobStore.get(target),
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        error: message,
        status: "failed",
        platform: target,
      });
    }
  });

  app.delete("/api/sessions/:platform", async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    if (platform !== "naver" && platform !== "tistory") {
      return reply.status(400).send({
        error: "네이버·티스토리만 연결 해제할 수 있습니다.",
      });
    }
    try {
      await runWithUser(user, () => deleteStoredSession(platform as Platform));
      return { ok: true, platform };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.get("/api/thumbnail-background", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    try {
      return await runWithUser(user, async () => ({
        ok: true,
        preference: await getThumbnailBackgroundStatus(),
        samples: listSampleBackgrounds(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      if (isLikelyDbConnectionError(message)) {
        return reply.status(503).send({
          error:
            "배경 설정 조회 실패. Vercel에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 을 확인하세요.",
          detail: message,
        });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.get("/api/thumbnail-background/image", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    try {
      return await runWithUser(user, async () => {
        const uploaded = await getUploadedBackgroundBuffer();
        if (!uploaded) {
          return reply.status(404).send({
            error: "업로드된 배경 이미지가 없습니다.",
          });
        }
        return reply
          .type(uploaded.mimeType)
          .header("Cache-Control", "no-store")
          .send(uploaded.buffer);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.post("/api/thumbnail-background", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }

    const body = (request.body ?? {}) as {
      action?: string;
      sampleId?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    try {
      return await runWithUser(user, async () => {
        if (body.action === "sample") {
          const sampleId = body.sampleId?.trim();
          if (!sampleId) {
            return reply.status(400).send({
              error: "sampleId가 필요합니다.",
            });
          }
          const preference = await saveSampleThumbnailBackground(sampleId);
          logger.info(
            `썸네일 샘플 배경 선택: ${sampleId} (user=${user.id})`,
          );
          return { ok: true, preference };
        }

        if (body.action === "upload") {
          const imageBase64 = body.imageBase64?.trim();
          if (!imageBase64) {
            return reply.status(400).send({
              error: "imageBase64가 필요합니다.",
            });
          }
          const preference = await saveUploadedThumbnailBackground(
            imageBase64,
            body.mimeType?.trim() || "image/png",
          );
          logger.info(`썸네일 배경 업로드 완료 (user=${user.id})`);
          return { ok: true, preference };
        }

        return reply.status(400).send({
          error:
            'action은 "upload" 또는 "sample" 이어야 합니다.',
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      if (isLikelyDbConnectionError(message)) {
        return reply.status(503).send({
          error:
            "배경 저장 실패. Vercel에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 을 확인하세요.",
          detail: message,
        });
      }
      if (
        /PNG|JPEG|WebP|2MB|빈 이미지|읽을 수 없|알 수 없는 샘플/i.test(
          message,
        )
      ) {
        return reply.status(400).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.delete("/api/thumbnail-background", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "로그인이 필요합니다." });
    }
    try {
      return await runWithUser(user, async () => {
        const preference = await clearThumbnailBackground();
        logger.info(`썸네일 배경 설정 삭제 (user=${user.id})`);
        return { ok: true, preference };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthContextError(message)) {
        return reply.status(401).send({ error: "로그인이 필요합니다." });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.get("/api/thumbnails/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = path.basename(filename);
    const filePath = path.join(config.thumbnailsDir, safeName);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: "썸네일을 찾을 수 없습니다." });
    }

    return reply.type("image/png").send(fs.createReadStream(filePath));
  });

  if (serveStatic) {
    await app.register(fastifyStatic, {
      root: path.join(config.projectRoot, "public"),
      prefix: "/",
    });
  }

  return app;
}
