-- Migration 0042: TOPIC_FEED clustering table.
--
-- Hosts the de-duplicated, multi-day topic clusters that drive every news-drift
-- and Notes agent (M1, M3, S1, S3, ticker #5/#8, Tape annotation). Built daily
-- by `topic-feed-builder` over a 14-day BETA_12_News_digest window via
-- gpt-5-mini clustering.
--
-- One row per (scope, canonical topic). Re-runs upsert; days_active counts
-- consecutive presence: date_last_seen - date_first_seen + 1.
--
-- scope grammar:
--   ticker:NVDA  | sector:Technology | macro:rates | macro:fed | ...
-- so callers can `WHERE scope LIKE 'macro:%'` etc.

CREATE TABLE IF NOT EXISTS TOPIC_FEED (
  id TEXT PRIMARY KEY,              -- hash(scope|topic_canonical|date_first_seen)
  scope TEXT NOT NULL,              -- 'ticker:NVDA' | 'sector:Technology' | 'macro:rates' | ...
  topic_canonical TEXT NOT NULL,    -- de-duped human-readable label
  summary TEXT,                     -- one-sentence current state
  date_first_seen TEXT NOT NULL,    -- YYYY-MM-DD
  date_last_seen TEXT NOT NULL,     -- YYYY-MM-DD
  days_active INTEGER,              -- date_last_seen - date_first_seen + 1
  mention_count INTEGER,
  source_count INTEGER,
  sources_json TEXT,                -- JSON array of BETA_12_News_digest ids
  score REAL,                       -- mention_count * source_diversity
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_topic_feed_scope     ON TOPIC_FEED(scope, date_last_seen);
CREATE INDEX IF NOT EXISTS idx_topic_feed_last_seen ON TOPIC_FEED(date_last_seen);
