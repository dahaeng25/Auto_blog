import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { config } from "../config/index.js";
import type { Platform } from "../config/platforms.js";
import { requireApiKey } from "./api/auth-hook.js";
import { jobStore } from "./api/job-store.js";
import { readRecentLogs } from "./api/log-reader.js";
import { hasSession } from "./auth/session-manager.js";
import { TopicRepository } from "./content/farming/topic-repository.js";
import type { TopicStatus } from "./content/types.js";
import { logger } from "./monitoring/logger.js";
import { isPipelineRunning, runOrchestration } from "./pipeline.js";
import { saveStoredSession } from "./storage/session-store.js";

export interface CreateAppOptions {
  /** 정적 대시보드 서빙 (Docker/로컬) */
  serveStatic?: boolean;
}

export async function createApp(
  options: CreateAppOptions = {},
): Promise<FastifyInstance> {
  const { serveStatic = true } = options;
  const app = Fastify({ logger: false });

  app.addHook("onRequest", requireApiKey);

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/meta", async () => ({
    authRequired: false,
    version: "0.2.1",
    platform: config.isVercel ? "vercel" : "server",
  }));

  app.get("/api/status", async (request, reply) => {
    try {
      const naverSession = await hasSession("naver");
      const tistorySession = await hasSession("tistory");

      return {
        job: await jobStore.get(),
        isRunning: await isPipelineRunning(),
        config: {
          cronSchedule: config.cronSchedule,
          cronTimezone: config.cronTimezone,
          publishDryRun: config.publishDryRun,
          publishHeadless: config.publishHeadless,
          naverBlogId: config.naverBlogId || null,
          tistoryBlogName: config.tistoryBlogName || null,
          rssFeedCount: config.rssFeedUrls.length,
          authRequired: false,
          isVercel: config.isVercel,
        },
        sessions: {
          naver: naverSession,
          tistory: tistorySession,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return reply.status(503).send({
        error:
          "데이터베이스 연결 실패. Vercel에 TURSO_DATABASE_URL, TURSO_AUTH_TOKEN을 설정했는지 확인하세요.",
        detail: message,
      });
    }
  });

  app.post("/api/run", async (request, reply) => {
    if (await isPipelineRunning()) {
      return reply.status(409).send({
        error: "파이프라인이 이미 실행 중입니다.",
        job: await jobStore.get(),
      });
    }

    const trigger =
      (request.body as { trigger?: string } | undefined)?.trigger ?? "web";

    // Vercel 서버리스: 함수 종료 전까지 파이프라인 완료 대기
    if (config.isVercel) {
      try {
        const result = await runOrchestration({ trigger });
        return {
          message: "파이프라인이 완료되었습니다.",
          job: await jobStore.get(),
          title: result.draft.title,
        };
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
          job: await jobStore.get(),
        });
      }
    }

    void runOrchestration({ trigger }).catch(() => {});

    return reply.status(202).send({
      message: "파이프라인 실행을 시작했습니다.",
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

  app.get("/api/sessions", async () => ({
    naver: await hasSession("naver"),
    tistory: await hasSession("tistory"),
  }));

  app.post("/api/sessions/:platform", async (request, reply) => {
    const { platform } = request.params as { platform: string };

    if (platform !== "naver" && platform !== "tistory") {
      return reply.status(400).send({ error: "지원하지 않는 플랫폼입니다." });
    }

    const body = request.body;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "세션 JSON이 필요합니다." });
    }

    const json = JSON.stringify(body);
    await saveStoredSession(platform as Platform, json);

    logger.info(`세션 업로드 완료: ${platform}`);
    return { ok: true, platform };
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
