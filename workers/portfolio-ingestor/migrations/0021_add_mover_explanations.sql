-- Daily "biggest movers" explanations. Populated by big-movers-why worker.
-- Separate from SIGNAL_HISTORY_daily because it's a different product:
-- SIGNAL_HISTORY is per-ticker-per-day (feeds 14-bar strip), this is a
-- narrow selection of the day's ~5 biggest movers in each direction
-- paired with LLM explanations grounded in per-ticker news.

CREATE TABLE IF NOT EXISTS MOVER_EXPLANATIONS_daily (
  id TEXT PRIMARY KEY,              -- hash(date + ticker)
  date TEXT NOT NULL,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,          -- 'up' | 'down'
  move_pct REAL NOT NULL,
  rank INTEGER,                     -- 1 = biggest mover in its direction
  headline TEXT,                    -- single most relevant headline
  thesis TEXT,                      -- one-sentence summary of why it moved
  bullets TEXT,                     -- JSON [{text, bias}]  grounded in news
  raw_blob TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_movers_date     ON MOVER_EXPLANATIONS_daily(date);
CREATE INDEX IF NOT EXISTS idx_movers_date_dir ON MOVER_EXPLANATIONS_daily(date, direction, rank);
