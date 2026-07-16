import type { DbExecutor } from "./types.js";

/** 기존 단일유저 데이터를 귀속할 시스템 계정 (로그인 불가 placeholder hash) */
const LEGACY_USERNAME = "__legacy__";
const LEGACY_PASSWORD_HASH = "!legacy-no-login";

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

/**
 * 기존 행을 귀속할 user id.
 * 사용자가 이미 있으면 최초 계정, 없으면 __legacy__ 시스템 계정을 만든다.
 */
async function ensureOwnerUserId(db: DbExecutor): Promise<number> {
  const first = await db.execute(
    "SELECT id FROM users ORDER BY id ASC LIMIT 1",
  );
  if (first.rows.length > 0) {
    return Number((first.rows[0] as Record<string, unknown>).id);
  }

  await db.execute(
    `INSERT INTO users (username, password_hash, created_at)
     VALUES (?, ?, ?)`,
    [LEGACY_USERNAME, LEGACY_PASSWORD_HASH, new Date().toISOString()],
  );

  const created = await db.execute(
    "SELECT id FROM users WHERE username = ?",
    [LEGACY_USERNAME],
  );
  if (created.rows.length === 0) {
    throw new Error("레거시 사용자 생성에 실패했습니다.");
  }
  return Number((created.rows[0] as Record<string, unknown>).id);
}

/**
 * topics 를 user_id 스키마로 재구성.
 *
 * Turso 는 foreign_keys=ON 이 기본이라, articles/published_posts 가
 * topics(id) 를 참조하는 동안 DROP TABLE topics 하면
 * FOREIGN KEY constraint failed 가 난다.
 * → 자식 테이블을 topics_v2 를 참조하도록 먼저 옮긴 뒤 부모를 교체한다.
 */
async function migrateTopicsTable(
  db: DbExecutor,
  ownerId: number,
): Promise<void> {
  if (!(await tableExists(db, "topics"))) return;
  const cols = await tableColumns(db, "topics");
  if (cols.has("user_id")) return;

  await db.execute(`DROP TABLE IF EXISTS topics_v2`);
  await db.execute(`
    CREATE TABLE topics_v2 (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      source_url  TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      summary     TEXT    NOT NULL DEFAULT '',
      fetched_at  TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'farmed',
      UNIQUE(user_id, source_url)
    )
  `);
  await db.execute(
    `INSERT INTO topics_v2 (id, user_id, source_url, title, summary, fetched_at, status)
     SELECT id, ?, source_url, title, summary, fetched_at, status FROM topics`,
    [ownerId],
  );

  if (await tableExists(db, "articles")) {
    const articleCols = await tableColumns(db, "articles");
    await db.execute(`DROP TABLE IF EXISTS articles_v2`);
    await db.execute(`
      CREATE TABLE articles_v2 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL,
        topic_id        INTEGER NOT NULL,
        title           TEXT    NOT NULL,
        html_body       TEXT    NOT NULL,
        thumbnail_text  TEXT    NOT NULL,
        created_at      TEXT    NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics_v2(id)
      )
    `);
    if (articleCols.has("user_id")) {
      await db.execute(
        `INSERT INTO articles_v2
           (id, user_id, topic_id, title, html_body, thumbnail_text, created_at)
         SELECT id,
                CASE WHEN user_id IS NULL OR user_id = 0 THEN ? ELSE user_id END,
                topic_id, title, html_body, thumbnail_text, created_at
         FROM articles`,
        [ownerId],
      );
    } else {
      await db.execute(
        `INSERT INTO articles_v2
           (id, user_id, topic_id, title, html_body, thumbnail_text, created_at)
         SELECT id, ?, topic_id, title, html_body, thumbnail_text, created_at
         FROM articles`,
        [ownerId],
      );
    }
    await db.execute(`DROP TABLE articles`);
  }

  if (await tableExists(db, "published_posts")) {
    const postCols = await tableColumns(db, "published_posts");
    await db.execute(`DROP TABLE IF EXISTS published_posts_v2`);
    await db.execute(`
      CREATE TABLE published_posts_v2 (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL,
        topic_id     INTEGER,
        platform     TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        keywords     TEXT    NOT NULL,
        post_url     TEXT    NOT NULL UNIQUE,
        published_at TEXT    NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics_v2(id)
      )
    `);
    if (postCols.has("user_id")) {
      await db.execute(
        `INSERT INTO published_posts_v2
           (id, user_id, topic_id, platform, title, keywords, post_url, published_at)
         SELECT id,
                CASE WHEN user_id IS NULL OR user_id = 0 THEN ? ELSE user_id END,
                topic_id, platform, title, keywords, post_url, published_at
         FROM published_posts`,
        [ownerId],
      );
    } else {
      await db.execute(
        `INSERT INTO published_posts_v2
           (id, user_id, topic_id, platform, title, keywords, post_url, published_at)
         SELECT id, ?, topic_id, platform, title, keywords, post_url, published_at
         FROM published_posts`,
        [ownerId],
      );
    }
    await db.execute(`DROP TABLE published_posts`);
  }

  // 자식 FK 가 topics_v2 만 가리키므로 이제 부모 DROP 가능 (foreign_keys=ON 포함)
  await db.execute(`DROP TABLE topics`);
  await db.execute(`ALTER TABLE topics_v2 RENAME TO topics`);

  if (await tableExists(db, "articles_v2")) {
    await db.execute(`ALTER TABLE articles_v2 RENAME TO articles`);
  }
  if (await tableExists(db, "published_posts_v2")) {
    await db.execute(`ALTER TABLE published_posts_v2 RENAME TO published_posts`);
  }

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id)`,
  );
  if (await tableExists(db, "articles")) {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id)`,
    );
  }
  if (await tableExists(db, "published_posts")) {
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_published_posts_keywords ON published_posts(keywords)`,
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_published_posts_published_at ON published_posts(published_at)`,
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_published_posts_user ON published_posts(user_id)`,
    );
  }
}

/** user_id = 0 / NULL 인 기존 행을 owner 로 귀속 */
async function backfillZeroUserIds(
  db: DbExecutor,
  ownerId: number,
): Promise<void> {
  const tables = ["topics", "articles", "published_posts", "platform_sessions"] as const;
  for (const table of tables) {
    if (!(await tableExists(db, table))) continue;
    const cols = await tableColumns(db, table);
    if (!cols.has("user_id")) continue;
    await db.execute(
      `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL OR user_id = 0`,
      [ownerId],
    );
  }

  if (!(await tableExists(db, "job_state"))) return;
  const jobCols = await tableColumns(db, "job_state");
  if (!jobCols.has("user_id")) return;

  const zero = await db.execute(
    "SELECT 1 FROM job_state WHERE user_id = 0 LIMIT 1",
  );
  if (zero.rows.length === 0) return;

  const ownerRow = await db.execute(
    "SELECT 1 FROM job_state WHERE user_id = ? LIMIT 1",
    [ownerId],
  );
  if (ownerRow.rows.length > 0) {
    await db.execute("DELETE FROM job_state WHERE user_id = 0");
  } else {
    await db.execute("UPDATE job_state SET user_id = ? WHERE user_id = 0", [
      ownerId,
    ]);
  }
}

async function tableNeedsUserIdMigration(
  db: DbExecutor,
  table: string,
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const cols = await tableColumns(db, table);
  return !cols.has("user_id");
}

async function hasZeroUserIdRows(db: DbExecutor): Promise<boolean> {
  const tables = [
    "topics",
    "articles",
    "published_posts",
    "platform_sessions",
    "job_state",
  ] as const;
  for (const table of tables) {
    if (!(await tableExists(db, table))) continue;
    const cols = await tableColumns(db, table);
    if (!cols.has("user_id")) continue;
    const result = await db.execute(
      `SELECT 1 FROM ${table} WHERE user_id IS NULL OR user_id = 0 LIMIT 1`,
    );
    if (result.rows.length > 0) return true;
  }
  return false;
}

async function needsOwnerForMigration(db: DbExecutor): Promise<boolean> {
  if (await tableNeedsUserIdMigration(db, "topics")) return true;
  if (await tableNeedsUserIdMigration(db, "articles")) return true;
  if (await tableNeedsUserIdMigration(db, "published_posts")) return true;
  if (await tableNeedsUserIdMigration(db, "platform_sessions")) return true;
  if (await tableNeedsUserIdMigration(db, "job_state")) return true;
  return hasZeroUserIdRows(db);
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

  if (!(await needsOwnerForMigration(db))) {
    return;
  }

  const ownerId = await ensureOwnerUserId(db);

  // Turso HTTP 에서도 동작하도록 PRAGMA 에만 의존하지 않음.
  // 로컬/동일 커넥션에서는 OFF 가 DROP 을 추가로 안전하게 만든다.
  try {
    await db.execute("PRAGMA foreign_keys = OFF");
  } catch {
    // libsql 일부 경로에서 pragma 미지원이어도 children-first 재구성으로 진행
  }

  try {
    await migrateTopicsTable(db, ownerId);

    if (await tableExists(db, "articles")) {
      const added = await addColumnIfMissing(
        db,
        "articles",
        "user_id",
        `user_id INTEGER NOT NULL DEFAULT ${ownerId}`,
      );
      if (added) {
        await db.execute(
          `UPDATE articles SET user_id = ? WHERE user_id IS NULL OR user_id = 0`,
          [ownerId],
        );
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
        `user_id INTEGER NOT NULL DEFAULT ${ownerId}`,
      );
      if (added) {
        await db.execute(
          `UPDATE published_posts SET user_id = ? WHERE user_id IS NULL OR user_id = 0`,
          [ownerId],
        );
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
        await db.execute(
          `INSERT INTO platform_sessions_v2 (user_id, platform, state_json, updated_at)
           SELECT ?, platform, state_json, updated_at FROM platform_sessions`,
          [ownerId],
        );
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
        await db.execute(
          `INSERT INTO job_state_v2 (
            user_id, status, trigger_source, started_at, finished_at,
            last_error, last_title, last_thumbnail_path
          )
          SELECT ?, status, trigger_source, started_at, finished_at,
                 last_error, last_title, last_thumbnail_path
          FROM job_state`,
          [ownerId],
        );
        await db.execute(`DROP TABLE job_state`);
        await db.execute(`ALTER TABLE job_state_v2 RENAME TO job_state`);
      }
    }

    await backfillZeroUserIds(db, ownerId);
  } finally {
    try {
      await db.execute("PRAGMA foreign_keys = ON");
    } catch {
      // ignore
    }
  }
}
