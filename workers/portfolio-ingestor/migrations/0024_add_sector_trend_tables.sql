-- Migration 0024: Sector-level trend narrative tables (Sprint 3)
--
-- Mirrors TICKER_TREND_long / TICKER_TREND_short (migration 0020), keyed by
-- sector instead of ticker. Written by:
--   - sector-trend-long  (wave 1700, gpt-5, daily rebuild)
--   - sector-trend-short (wave 1800, gpt-5, trigger-gated)

CREATE TABLE IF NOT EXISTS SECTOR_TREND_long (
  sector TEXT PRIMARY KEY,
  as_of TEXT NOT NULL,
  updated_by TEXT,             -- 'daily' | 'force' | event id
  regime TEXT,                 -- bullish | cautious_bullish | neutral | cautious_bearish | bearish
  score REAL,                  -- -1.0 .. +1.0
  thesis TEXT,                 -- one sentence
  drivers TEXT,                -- JSON [{text, bias}]
  narrative TEXT,              -- JSON [{text, bias}]
  raw_blob TEXT,               -- full LLM response for audit
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SECTOR_TREND_short (
  sector TEXT PRIMARY KEY,
  as_of TEXT NOT NULL,
  trigger TEXT,                -- 'stance_change' | 'rs_cross' | 'stale' | 'force'
  trigger_detail TEXT,
  regime TEXT,
  score REAL,
  thesis TEXT,
  drivers TEXT,
  narrative TEXT,
  raw_blob TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
