import { getDb } from "../../db/client.js";
import type {
  ArticleDraft,
  RawTopic,
  TopicRecord,
  TopicStatus,
} from "../types.js";
import type { SqlRow } from "../../db/types.js";

function mapTopic(row: SqlRow): TopicRecord {
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
 * 주제/원고 저장소 — 로컬 SQLite 또는 Turso(libsql)
 */
export class TopicRepository {
  async existsByUrl(sourceUrl: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.execute(
      "SELECT 1 FROM topics WHERE source_url = ?",
      [sourceUrl],
    );
    return result.rows.length > 0;
  }

  async insertTopic(topic: RawTopic): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO topics (source_url, title, summary, fetched_at, status)
       VALUES (?, ?, ?, ?, 'farmed')`,
      [topic.sourceUrl, topic.title, topic.summary, new Date().toISOString()],
    );
    return Number(result.lastInsertRowid);
  }

  async updateStatus(topicId: number, status: TopicStatus): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE topics SET status = ? WHERE id = ?", [
      status,
      topicId,
    ]);
  }

  async saveArticle(draft: ArticleDraft): Promise<number> {
    const db = await getDb();
    const batch = await db.batch([
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
    return Number(batch[0].lastInsertRowid);
  }

  async listTopics(
    options: { status?: TopicStatus; limit?: number } = {},
  ): Promise<TopicRecord[]> {
    const { status, limit = 50 } = options;
    const db = await getDb();
    const result = status
      ? await db.execute(
          `SELECT id, source_url, title, summary, fetched_at, status
           FROM topics WHERE status = ? ORDER BY id DESC LIMIT ?`,
          [status, limit],
        )
      : await db.execute(
          `SELECT id, source_url, title, summary, fetched_at, status
           FROM topics ORDER BY id DESC LIMIT ?`,
          [limit],
        );
    return result.rows.map(mapTopic);
  }

  async listArticles(limit = 20): Promise<
    Array<{
      id: number;
      topicId: number;
      title: string;
      thumbnailText: string;
      createdAt: string;
    }>
  > {
    const db = await getDb();
    const result = await db.execute(
      `SELECT id, topic_id, title, thumbnail_text, created_at
       FROM articles ORDER BY id DESC LIMIT ?`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      topicId: Number(row.topic_id),
      title: String(row.title),
      thumbnailText: String(row.thumbnail_text),
      createdAt: String(row.created_at),
    }));
  }

  async getArticleById(id: number): Promise<{
    id: number;
    topicId: number;
    title: string;
    htmlBody: string;
    thumbnailText: string;
    createdAt: string;
  } | null> {
    const db = await getDb();
    const result = await db.execute(
      `SELECT id, topic_id, title, html_body, thumbnail_text, created_at
       FROM articles WHERE id = ?`,
      [id],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: Number(row.id),
      topicId: Number(row.topic_id),
      title: String(row.title),
      htmlBody: String(row.html_body),
      thumbnailText: String(row.thumbnail_text),
      createdAt: String(row.created_at),
    };
  }

  async getStats(): Promise<{
    topics: Record<TopicStatus, number>;
    articles: number;
  }> {
    const db = await getDb();
    const topicResult = await db.execute(
      "SELECT status, COUNT(*) as count FROM topics GROUP BY status",
    );
    const topics = { farmed: 0, drafted: 0, published: 0 };
    for (const row of topicResult.rows) {
      topics[row.status as TopicStatus] = Number(row.count);
    }
    const articleResult = await db.execute(
      "SELECT COUNT(*) as count FROM articles",
    );
    return { topics, articles: Number(articleResult.rows[0].count) };
  }

  async getTopicById(id: number): Promise<TopicRecord | null> {
    const db = await getDb();
    const result = await db.execute(
      `SELECT id, source_url, title, summary, fetched_at, status
       FROM topics WHERE id = ?`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapTopic(result.rows[0]);
  }

  close(): void {
    // 싱글톤 executor 유지
  }
}
