-- 주제 수집 및 발행 이력 관리

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL DEFAULT 0,
  source_url  TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  fetched_at  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'farmed',
  UNIQUE(user_id, source_url)
);

CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL DEFAULT 0,
  topic_id        INTEGER NOT NULL,
  title           TEXT    NOT NULL,
  html_body       TEXT    NOT NULL,
  thumbnail_text  TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);

-- 발행 완료 포스트 (SEO 내부 링크용)
CREATE TABLE IF NOT EXISTS published_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL DEFAULT 0,
  topic_id     INTEGER,
  platform     TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  keywords     TEXT    NOT NULL,
  post_url     TEXT    NOT NULL UNIQUE,
  published_at TEXT    NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE INDEX IF NOT EXISTS idx_published_posts_keywords ON published_posts(keywords);
CREATE INDEX IF NOT EXISTS idx_published_posts_published_at ON published_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_published_posts_user ON published_posts(user_id);

-- 파이프라인 실행 상태 (사용자별)
CREATE TABLE IF NOT EXISTS job_state (
  user_id             INTEGER PRIMARY KEY,
  status              TEXT    NOT NULL DEFAULT 'idle',
  trigger_source      TEXT,
  started_at          TEXT,
  finished_at         TEXT,
  last_error          TEXT,
  last_title          TEXT,
  last_thumbnail_path TEXT
);

-- Vercel 등 서버리스 환경용 플랫폼 세션 저장 (사용자 × 플랫폼)
CREATE TABLE IF NOT EXISTS platform_sessions (
  user_id     INTEGER NOT NULL,
  platform    TEXT    NOT NULL,
  state_json  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (user_id, platform)
);

-- 계정 연결(자동 로그인) 비동기 작업 상태 (네이버·티스토리)
CREATE TABLE IF NOT EXISTS platform_connect_jobs (
  user_id     INTEGER NOT NULL,
  platform    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'idle',
  started_at  TEXT,
  finished_at TEXT,
  last_error  TEXT,
  PRIMARY KEY (user_id, platform)
);

-- 사용자별 썸네일 배경 (업로드 이미지 또는 샘플 그라데이션)
CREATE TABLE IF NOT EXISTS user_thumbnail_backgrounds (
  user_id      INTEGER PRIMARY KEY,
  source       TEXT    NOT NULL,
  sample_id    TEXT,
  image_base64 TEXT,
  mime_type    TEXT,
  updated_at   TEXT    NOT NULL
);
