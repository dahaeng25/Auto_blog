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
