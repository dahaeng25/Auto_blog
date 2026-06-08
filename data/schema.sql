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
