-- 주제 수집 및 발행 이력 관리

CREATE TABLE IF NOT EXISTS topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url  TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  fetched_at  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'farmed'
);

CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id        INTEGER NOT NULL,
  title           TEXT    NOT NULL,
  html_body       TEXT    NOT NULL,
  thumbnail_text  TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);

-- 파이프라인 실행 상태 (단일 행)
CREATE TABLE IF NOT EXISTS job_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  status              TEXT    NOT NULL DEFAULT 'idle',
  trigger_source      TEXT,
  started_at          TEXT,
  finished_at         TEXT,
  last_error          TEXT,
  last_title          TEXT,
  last_thumbnail_path TEXT
);

INSERT OR IGNORE INTO job_state (id, status) VALUES (1, 'idle');

-- Vercel 등 서버리스 환경용 플랫폼 세션 저장
CREATE TABLE IF NOT EXISTS platform_sessions (
  platform    TEXT PRIMARY KEY,
  state_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
