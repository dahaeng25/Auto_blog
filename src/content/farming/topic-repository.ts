import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../../../config/index.js";
import type {
  ArticleDraft,
  RawTopic,
  TopicRecord,
  TopicStatus,
} from "../types.js";

/**
 * SQLite 기반 주제/원고 저장소.
 * 중복 발행 방지를 위해 source_url UNIQUE 제약을 사용합니다.
 */
export class TopicRepository {
  private db: Database.Database;

  constructor(dbPath: string = config.dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    const schemaPath = path.join(config.dataDir, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    this.db.exec(schema);
  }

  /** source_url 기준 중복 여부 확인 */
  existsByUrl(sourceUrl: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM topics WHERE source_url = ?")
      .get(sourceUrl);
    return row !== undefined;
  }

  /** 새 주제를 DB에 등록하고 ID를 반환 */
  insertTopic(topic: RawTopic): number {
    const result = this.db
      .prepare(
        `INSERT INTO topics (source_url, title, summary, fetched_at, status)
         VALUES (?, ?, ?, ?, 'farmed')`,
      )
      .run(
        topic.sourceUrl,
        topic.title,
        topic.summary,
        new Date().toISOString(),
      );
    return Number(result.lastInsertRowid);
  }

  /** 주제 상태 업데이트 */
  updateStatus(topicId: number, status: TopicStatus): void {
    this.db
      .prepare("UPDATE topics SET status = ? WHERE id = ?")
      .run(status, topicId);
  }

  /** 원고 저장 및 주제 상태를 drafted로 변경 */
  saveArticle(draft: ArticleDraft): number {
    const insert = this.db.prepare(
      `INSERT INTO articles (topic_id, title, html_body, thumbnail_text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const tx = this.db.transaction(() => {
      const result = insert.run(
        draft.topicId,
        draft.title,
        draft.htmlBody,
        draft.thumbnailText,
        draft.createdAt,
      );
      this.updateStatus(draft.topicId, "drafted");
      return Number(result.lastInsertRowid);
    });

    return tx();
  }

  /** source_url로 주제 조회 */
  getTopicBySourceUrl(sourceUrl: string): TopicRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, source_url, title, summary, fetched_at, status
         FROM topics WHERE source_url = ?`,
      )
      .get(sourceUrl) as
      | {
          id: number;
          source_url: string;
          title: string;
          summary: string;
          fetched_at: string;
          status: TopicStatus;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sourceUrl: row.source_url,
      title: row.title,
      summary: row.summary,
      fetchedAt: row.fetched_at,
      status: row.status,
    };
  }

  /** 주제의 최신 원고 조회 */
  getLatestArticleByTopicId(topicId: number): ArticleDraft | null {
    const row = this.db
      .prepare(
        `SELECT a.topic_id, a.title, a.html_body, a.thumbnail_text, a.created_at,
                t.source_url, t.summary, t.title as topic_title
         FROM articles a
         JOIN topics t ON t.id = a.topic_id
         WHERE a.topic_id = ?
         ORDER BY a.id DESC
         LIMIT 1`,
      )
      .get(topicId) as
      | {
          topic_id: number;
          title: string;
          html_body: string;
          thumbnail_text: string;
          created_at: string;
          source_url: string;
          summary: string;
          topic_title: string;
        }
      | undefined;

    if (!row) return null;

    return {
      topicId: row.topic_id,
      sourceTopic: {
        sourceUrl: row.source_url,
        title: row.topic_title,
        summary: row.summary,
        sourceFeed: "gems-manual",
      },
      title: row.title,
      htmlBody: row.html_body,
      thumbnailText: row.thumbnail_text,
      createdAt: row.created_at,
    };
  }

  /** 주제와 연결된 원고 전체 삭제 후 주제도 삭제 (재생성용) */
  deleteTopicAndArticles(sourceUrl: string): void {
    const tx = this.db.transaction(() => {
      const topic = this.db
        .prepare("SELECT id FROM topics WHERE source_url = ?")
        .get(sourceUrl) as { id: number } | undefined;
      if (!topic) return;

      this.db
        .prepare("DELETE FROM articles WHERE topic_id = ?")
        .run(topic.id);
      this.db
        .prepare("DELETE FROM topics WHERE id = ?")
        .run(topic.id);
    });
    tx();
  }

  getTopicById(id: number): TopicRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, source_url, title, summary, fetched_at, status
         FROM topics WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          source_url: string;
          title: string;
          summary: string;
          fetched_at: string;
          status: TopicStatus;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sourceUrl: row.source_url,
      title: row.title,
      summary: row.summary,
      fetchedAt: row.fetched_at,
      status: row.status,
    };
  }

  close(): void {
    this.db.close();
  }
}
