import { getDb } from "../../db/client.js";
import type { DbExecutor } from "../../db/types.js";
import type { Platform } from "../../../config/platforms.js";
import { requireUserId } from "../../auth/user-context.js";

export interface PublishedPostRecord {
  id: number;
  topicId: number | null;
  platform: Platform;
  title: string;
  keywords: string;
  postUrl: string;
  publishedAt: string;
}

export interface SavePublishedPostInput {
  topicId?: number;
  platform: Platform;
  title: string;
  keywords: string;
  postUrl: string;
}

function mapRow(row: Record<string, unknown>): PublishedPostRecord {
  return {
    id: Number(row.id),
    topicId: row.topic_id != null ? Number(row.topic_id) : null,
    platform: String(row.platform) as Platform,
    title: String(row.title),
    keywords: String(row.keywords),
    postUrl: String(row.post_url),
    publishedAt: String(row.published_at),
  };
}

/** 키워드 문자열에서 검색용 토큰 추출 */
function tokenizeKeywords(keywords: string): string[] {
  return keywords
    .split(/[,，/|·\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/**
 * 발행 완료 포스트 저장소 — SEO 내부 링크 조회·저장
 */
export class PublishedPostRepository {
  private readonly dbPromise: Promise<DbExecutor>;

  constructor() {
    this.dbPromise = getDb();
  }

  private async db(): Promise<DbExecutor> {
    return this.dbPromise;
  }

  private userId(): number {
    return requireUserId();
  }

  async save(input: SavePublishedPostInput): Promise<void> {
    const db = await this.db();
    await db.execute(
      `INSERT INTO published_posts (user_id, topic_id, platform, title, keywords, post_url, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_url) DO UPDATE SET
         user_id = excluded.user_id,
         title = excluded.title,
         keywords = excluded.keywords,
         published_at = excluded.published_at`,
      [
        this.userId(),
        input.topicId ?? null,
        input.platform,
        input.title,
        input.keywords.trim(),
        input.postUrl,
        new Date().toISOString(),
      ],
    );
  }

  /**
   * 현재 키워드와 연관된 기존 발행 글 2~3건 조회
   * (키워드 토큰 일치 → 제목 유사 → 최신순)
   */
  async findRelated(keywords: string, limit = 3): Promise<PublishedPostRecord[]> {
    const db = await this.db();
    const userId = this.userId();
    const tokens = tokenizeKeywords(keywords);
    const seen = new Set<string>();
    const results: PublishedPostRecord[] = [];

    for (const token of tokens) {
      if (results.length >= limit) break;

      const pattern = `%${token}%`;
      const result = await db.execute(
        `SELECT id, topic_id, platform, title, keywords, post_url, published_at
         FROM published_posts
         WHERE user_id = ? AND (keywords LIKE ? OR title LIKE ?)
         ORDER BY published_at DESC
         LIMIT ?`,
        [userId, pattern, pattern, limit * 2],
      );

      for (const row of result.rows) {
        const mapped = mapRow(row as Record<string, unknown>);
        if (seen.has(mapped.postUrl)) continue;
        seen.add(mapped.postUrl);
        results.push(mapped);
        if (results.length >= limit) break;
      }
    }

    if (results.length < limit) {
      const fallback = await db.execute(
        `SELECT id, topic_id, platform, title, keywords, post_url, published_at
         FROM published_posts
         WHERE user_id = ?
         ORDER BY published_at DESC
         LIMIT ?`,
        [userId, limit * 2],
      );

      for (const row of fallback.rows) {
        const mapped = mapRow(row as Record<string, unknown>);
        if (seen.has(mapped.postUrl)) continue;
        seen.add(mapped.postUrl);
        results.push(mapped);
        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  /** 최근 발행 이력 조회 (대시보드용) */
  async listRecent(limit = 20): Promise<PublishedPostRecord[]> {
    const db = await this.db();
    const result = await db.execute(
      `SELECT id, topic_id, platform, title, keywords, post_url, published_at
       FROM published_posts
       WHERE user_id = ?
       ORDER BY published_at DESC
       LIMIT ?`,
      [this.userId(), limit],
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  close(): void {
    /* 싱글톤 DbExecutor — 연결 유지 */
  }
}
