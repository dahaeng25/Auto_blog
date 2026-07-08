import { getDb } from "../../db/client.js";
import type { DbExecutor } from "../../db/types.js";
import type {
  ArticleDraft,
  RawTopic,
  TopicRecord,
  TopicStatus,
} from "../types.js";

type TopicRow = {
  id: number;
  source_url: string;
  title: string;
  summary: string;
  fetched_at: string;
  status: TopicStatus;
};

function mapTopicRow(row: Record<string, unknown>): TopicRecord {
  return {
    id: Number(row.id),
    sourceUrl: String(row.source_url),
    title: String(row.title),
    summary: String(row.summary),
    fetchedAt: String(row.fetched_at),
    status: row.status as TopicStatus,
  };
}

/**
 * 주제/원고 저장소 — 로컬 SQLite 또는 Turso(libsql) 공통.
 */
export class TopicRepository {
  private readonly dbPromise: Promise<DbExecutor>;

  constructor() {
    this.dbPromise = getDb();
  }

  private async db(): Promise<DbExecutor> {
    return this.dbPromise;
  }

  async existsByUrl(sourceUrl: string): Promise<boolean> {
    const db = await this.db();
    const result = await db.execute(
      "SELECT 1 FROM topics WHERE source_url = ?",
      [sourceUrl],
    );
    return result.rows.length > 0;
  }

  async insertTopic(topic: RawTopic): Promise<number> {
    const db = await this.db();
    const result = await db.execute(
      `INSERT INTO topics (source_url, title, summary, fetched_at, status)
       VALUES (?, ?, ?, ?, 'farmed')`,
      [topic.sourceUrl, topic.title, topic.summary, new Date().toISOString()],
    );
    return Number(result.lastInsertRowid);
  }

  async updateStatus(topicId: number, status: TopicStatus): Promise<void> {
    const db = await this.db();
    await db.execute("UPDATE topics SET status = ? WHERE id = ?", [
      status,
      topicId,
    ]);
  }

  async saveArticle(draft: ArticleDraft): Promise<number> {
    const db = await this.db();
    const results = await db.batch([
      {
        sql: `INSERT INTO articles (topic_id, title, html_body, thumbnail_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          draft.topicId,
          draft.title,
          draft.htmlBody,
          draft.thumbnailText,
          draft.createdAt,
        ],
      },
      {
        sql: "UPDATE topics SET status = ? WHERE id = ?",
        args: ["drafted", draft.topicId],
      },
    ]);
    return Number(results[0]?.lastInsertRowid);
  }

  async getTopicBySourceUrl(sourceUrl: string): Promise<TopicRecord | null> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT id, source_url, title, summary, fetched_at, status
       FROM topics WHERE source_url = ?`,
      [sourceUrl],
    );
    if (result.rows.length === 0) return null;
    return mapTopicRow(result.rows[0] as TopicRow);
  }

  async getLatestArticleByTopicId(topicId: number): Promise<ArticleDraft | null> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT a.topic_id, a.title, a.html_body, a.thumbnail_text, a.created_at,
              t.source_url, t.summary, t.title as topic_title
       FROM articles a
       JOIN topics t ON t.id = a.topic_id
       WHERE a.topic_id = ?
       ORDER BY a.id DESC
       LIMIT 1`,
      [topicId],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      topicId: Number(row.topic_id),
      sourceTopic: {
        sourceUrl: String(row.source_url),
        title: String(row.topic_title),
        summary: String(row.summary),
        sourceFeed: "gems-manual",
      },
      title: String(row.title),
      htmlBody: String(row.html_body),
      thumbnailText: String(row.thumbnail_text),
      createdAt: String(row.created_at),
    };
  }

  async getLatestArticle(): Promise<(ArticleDraft & { id: number }) | null> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT a.id, a.topic_id, a.title, a.html_body, a.thumbnail_text, a.created_at,
              t.source_url, t.summary, t.title as topic_title
       FROM articles a
       JOIN topics t ON t.id = a.topic_id
       ORDER BY a.id DESC
       LIMIT 1`,
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: Number(row.id),
      topicId: Number(row.topic_id),
      sourceTopic: {
        sourceUrl: String(row.source_url),
        title: String(row.topic_title),
        summary: String(row.summary),
        sourceFeed: "gems-manual",
      },
      title: String(row.title),
      htmlBody: String(row.html_body),
      thumbnailText: String(row.thumbnail_text),
      createdAt: String(row.created_at),
    };
  }

  async deleteTopicAndArticles(sourceUrl: string): Promise<void> {
    const db = await this.db();
    const topicResult = await db.execute(
      "SELECT id FROM topics WHERE source_url = ?",
      [sourceUrl],
    );
    if (topicResult.rows.length === 0) return;

    const topicId = Number(topicResult.rows[0].id);
    await db.batch([
      { sql: "DELETE FROM articles WHERE topic_id = ?", args: [topicId] },
      { sql: "DELETE FROM topics WHERE id = ?", args: [topicId] },
    ]);
  }

  async getTopicById(id: number): Promise<TopicRecord | null> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT id, source_url, title, summary, fetched_at, status
       FROM topics WHERE id = ?`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapTopicRow(result.rows[0] as TopicRow);
  }

  async listTopics(options?: {
    status?: TopicStatus;
    limit?: number;
  }): Promise<TopicRecord[]> {
    const db = await this.db();
    const limit = options?.limit ?? 50;
    const result = options?.status
      ? await db.execute(
          `SELECT id, source_url, title, summary, fetched_at, status
           FROM topics WHERE status = ?
           ORDER BY id DESC LIMIT ?`,
          [options.status, limit],
        )
      : await db.execute(
          `SELECT id, source_url, title, summary, fetched_at, status
           FROM topics ORDER BY id DESC LIMIT ?`,
          [limit],
        );

    return result.rows.map((row) => mapTopicRow(row as TopicRow));
  }

  async listArticles(
    limit = 20,
  ): Promise<Array<{ id: number; topicId: number; title: string; createdAt: string }>> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT id, topic_id, title, created_at
       FROM articles ORDER BY id DESC LIMIT ?`,
      [limit],
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      topicId: Number(row.topic_id),
      title: String(row.title),
      createdAt: String(row.created_at),
    }));
  }

  async getArticleById(
    id: number,
  ): Promise<(ArticleDraft & { id: number }) | null> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT a.id, a.topic_id, a.title, a.html_body, a.thumbnail_text, a.created_at,
              t.source_url, t.summary, t.title as topic_title
       FROM articles a
       JOIN topics t ON t.id = a.topic_id
       WHERE a.id = ?`,
      [id],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: Number(row.id),
      topicId: Number(row.topic_id),
      sourceTopic: {
        sourceUrl: String(row.source_url),
        title: String(row.topic_title),
        summary: String(row.summary),
        sourceFeed: "gems-manual",
      },
      title: String(row.title),
      htmlBody: String(row.html_body),
      thumbnailText: String(row.thumbnail_text),
      createdAt: String(row.created_at),
    };
  }

  async getStats(): Promise<{
    topics: { farmed: number; drafted: number; published: number };
    articles: number;
  }> {
    const db = await this.db();
    const counts = await db.execute(
      "SELECT status, COUNT(*) as count FROM topics GROUP BY status",
    );

    const topics = { farmed: 0, drafted: 0, published: 0 };
    for (const row of counts.rows) {
      const status = String(row.status) as TopicStatus;
      topics[status] = Number(row.count);
    }

    const articleResult = await db.execute(
      "SELECT COUNT(*) as count FROM articles",
    );
    const articles = Number(articleResult.rows[0]?.count ?? 0);

    return { topics, articles };
  }

  close(): void {
    /* 싱글톤 DbExecutor — 연결 유지 */
  }
}
