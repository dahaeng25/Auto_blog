import type { DbExecutor } from "./types.js";

function columnNameFromRow(row: Record<string, unknown>): string {
  if (row.name != null) return String(row.name);
  // libsql/Turso 가 배열형 Row 를 주는 경우 PRAGMA table_info 의 name 은 index 1
  if (row[1] != null) return String(row[1]);
  if (row.NAME != null) return String(row.NAME);
  return "";
}

async function tableColumns(
  db: DbExecutor,
  table: string,
): Promise<Set<string>> {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return new Set(
    result.rows
      .map((row) => columnNameFromRow(row as Record<string, unknown>))
      .filter(Boolean),
  );
}

async function tableExists(db: DbExecutor, table: string): Promise<boolean> {
  const result = await db.execute(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  return result.rows.length > 0;
}

async function addColumnIfMissing(
  db: DbExecutor,
  table: string,
  column: string,
  ddl: string,
): Promise<boolean> {
  const cols = await tableColumns(db, table);
  if (cols.has(column)) return false;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  return true;
}

/** 기존 DB에 user_id / 복합키 스키마를 점진 적용 */
export async function migrateUserScopedSchema(db: DbExecutor): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS user_sessions (
    token       TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    expires_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
  )`);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`,
  );

  if (await tableExists(db, "topics")) {
    const cols = await tableColumns(db, "topics");
    if (!cols.has("user_id")) {
      await db.execute(`DROP TABLE IF EXISTS topics_v2`);
      await db.execute(`
        CREATE TABLE topics_v2 (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL DEFAULT 0,
          source_url  TEXT    NOT NULL,
          title       TEXT    NOT NULL,
          summary     TEXT    NOT NULL DEFAULT '',
          fetched_at  TEXT    NOT NULL,
          status      TEXT    NOT NULL DEFAULT 'farmed',
          UNIQUE(user_id, source_url)
        )
      `);
      await db.execute(`
        INSERT INTO topics_v2 (id, user_id, source_url, title, summary, fetched_at, status)
        SELECT id, 0, source_url, title, summary, fetched_at, status FROM topics
      `);
      await db.execute(`DROP TABLE topics`);
      await db.execute(`ALTER TABLE topics_v2 RENAME TO topics`);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status)`,
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id)`,
      );
    }
  }

  if (await tableExists(db, "articles")) {
    const added = await addColumnIfMissing(
      db,
      "articles",
      "user_id",
      "user_id INTEGER NOT NULL DEFAULT 0",
    );
    if (added) {
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id)`,
      );
    }
  }

  if (await tableExists(db, "published_posts")) {
    const added = await addColumnIfMissing(
      db,
      "published_posts",
      "user_id",
      "user_id INTEGER NOT NULL DEFAULT 0",
    );
    if (added) {
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_published_posts_user ON published_posts(user_id)`,
      );
    }
  }

  if (await tableExists(db, "platform_sessions")) {
    const cols = await tableColumns(db, "platform_sessions");
    if (!cols.has("user_id")) {
      await db.execute(`DROP TABLE IF EXISTS platform_sessions_v2`);
      await db.execute(`
        CREATE TABLE platform_sessions_v2 (
          user_id     INTEGER NOT NULL,
          platform    TEXT    NOT NULL,
          state_json  TEXT    NOT NULL,
          updated_at  TEXT    NOT NULL,
          PRIMARY KEY (user_id, platform)
        )
      `);
      await db.execute(`
        INSERT INTO platform_sessions_v2 (user_id, platform, state_json, updated_at)
        SELECT 0, platform, state_json, updated_at FROM platform_sessions
      `);
      await db.execute(`DROP TABLE platform_sessions`);
      await db.execute(
        `ALTER TABLE platform_sessions_v2 RENAME TO platform_sessions`,
      );
    }
  }

  if (await tableExists(db, "job_state")) {
    const cols = await tableColumns(db, "job_state");
    if (!cols.has("user_id")) {
      await db.execute(`DROP TABLE IF EXISTS job_state_v2`);
      await db.execute(`
        CREATE TABLE job_state_v2 (
          user_id             INTEGER PRIMARY KEY,
          status              TEXT    NOT NULL DEFAULT 'idle',
          trigger_source      TEXT,
          started_at          TEXT,
          finished_at         TEXT,
          last_error          TEXT,
          last_title          TEXT,
          last_thumbnail_path TEXT
        )
      `);
      await db.execute(`
        INSERT INTO job_state_v2 (
          user_id, status, trigger_source, started_at, finished_at,
          last_error, last_title, last_thumbnail_path
        )
        SELECT 0, status, trigger_source, started_at, finished_at,
               last_error, last_title, last_thumbnail_path
        FROM job_state
      `);
      await db.execute(`DROP TABLE job_state`);
      await db.execute(`ALTER TABLE job_state_v2 RENAME TO job_state`);
    }
  }
}
