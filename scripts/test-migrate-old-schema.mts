import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { runSchemaMigration } from "../src/db/run-schema-migration.js";
import type { DbExecutor } from "../src/db/types.js";

function adapterFor(raw: Database.Database): DbExecutor {
  return {
    execute: async (sql, args = []) => {
      const stmt = raw.prepare(sql);
      const verb = sql.trim().split(/\s+/)[0]?.toUpperCase();
      if (verb === "SELECT" || verb === "PRAGMA") {
        return { rows: stmt.all(...args) as Record<string, unknown>[] };
      }
      try {
        const result = stmt.run(...args);
        return { rows: [], lastInsertRowid: result.lastInsertRowid };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}\nSQL: ${sql.slice(0, 240)}`);
      }
    },
    batch: async () => {
      throw new Error("batch not used");
    },
  };
}

function makeOldDb(tmp: string, foreignKeys: boolean): Database.Database {
  const raw = new Database(tmp);
  raw.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  raw.exec(`
CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'farmed'
);
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  html_body TEXT NOT NULL,
  thumbnail_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);
CREATE TABLE published_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  keywords TEXT NOT NULL,
  post_url TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);
CREATE TABLE job_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle',
  trigger_source TEXT,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  last_title TEXT,
  last_thumbnail_path TEXT
);
INSERT INTO job_state (id, status) VALUES (1, 'idle');
CREATE TABLE platform_sessions (
  platform TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO topics (source_url, title, summary, fetched_at, status)
VALUES ('https://ex.com/1', 't1', 's', '2020-01-01', 'farmed');
INSERT INTO articles (topic_id, title, html_body, thumbnail_text, created_at)
VALUES (1, 'a1', '<p>x</p>', 'thumb', '2020-01-01');
INSERT INTO published_posts (topic_id, platform, title, keywords, post_url, published_at)
VALUES (1, 'naver', 'p1', 'k', 'https://ex.com/p', '2020-01-01');
INSERT INTO platform_sessions (platform, state_json, updated_at)
VALUES ('naver', '{}', '2020-01-01');
`);
  return raw;
}

async function runOldSchemaCase(
  label: string,
  foreignKeys: boolean,
): Promise<void> {
  const tmp = path.join(
    os.tmpdir(),
    `autoblog-fk-${Date.now()}-${foreignKeys ? "on" : "off"}.db`,
  );
  const raw = makeOldDb(tmp, foreignKeys);
  console.log(
    `\n=== ${label} foreign_keys=${raw.pragma("foreign_keys", { simple: true })} ===`,
  );
  try {
    await runSchemaMigration(adapterFor(raw));
    raw.pragma("foreign_keys = ON");

    const topic = raw.prepare("SELECT user_id FROM topics LIMIT 1").get() as {
      user_id: number;
    };
    const users = raw.prepare("SELECT id, username FROM users").all() as Array<{
      id: number;
      username: string;
    }>;
    const job = raw.prepare("SELECT user_id FROM job_state").get() as {
      user_id: number;
    };

    // signup-like inserts
    raw
      .prepare(
        `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
      )
      .run("alice", "hash", new Date().toISOString());
    const alice = raw
      .prepare("SELECT id FROM users WHERE username = ?")
      .get("alice") as { id: number };
    raw
      .prepare(`INSERT INTO job_state (user_id, status) VALUES (?, 'idle')`)
      .run(alice.id);
    raw
      .prepare(
        `INSERT INTO user_sessions (token, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run("tok", alice.id, "2099-01-01", "2020-01-01");

    console.log("SUCCESS");
    console.log("legacy users:", users);
    console.log("topic.user_id:", topic.user_id, "job.user_id:", job.user_id);
    console.log("signup user id:", alice.id);
  } catch (error) {
    console.log("FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    raw.close();
    fs.unlinkSync(tmp);
  }
}

async function runEmptyDbCase(): Promise<void> {
  const tmp = path.join(os.tmpdir(), `autoblog-empty-${Date.now()}.db`);
  const raw = new Database(tmp);
  raw.pragma("foreign_keys = ON");
  console.log("\n=== EMPTY_DB foreign_keys=ON ===");
  try {
    await runSchemaMigration(adapterFor(raw));
    const users = raw.prepare("SELECT id, username FROM users").all();
    raw
      .prepare(
        `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
      )
      .run("bob", "hash", new Date().toISOString());
    const bob = raw
      .prepare("SELECT id FROM users WHERE username = ?")
      .get("bob") as { id: number };
    raw
      .prepare(`INSERT INTO job_state (user_id, status) VALUES (?, 'idle')`)
      .run(bob.id);
    console.log("SUCCESS users_before_signup:", users, "bob.id:", bob.id);
    if (users.length !== 0) {
      console.log("FAIL: empty DB should not create legacy user");
      process.exitCode = 1;
    }
  } catch (error) {
    console.log("FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    raw.close();
    fs.unlinkSync(tmp);
  }
}

await runOldSchemaCase("FK_OFF", false);
await runOldSchemaCase("FK_ON", true);
await runEmptyDbCase();
