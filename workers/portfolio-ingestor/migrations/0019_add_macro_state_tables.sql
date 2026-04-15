-- Macro State Store: compact 8-week rolling view of the macro regime
-- Three streams feed the macro-trend-builder GPT-5 call:
--   (1) MACRO_STATE_indicators — dated numeric releases (CPI, NFP, yields, ...)
--   (2) MACRO_STATE_fomc       — full FOMC statements (~8/year)
--   (3) MACRO_STATE_news       — 1 top macro news item per week, curated

CREATE TABLE IF NOT EXISTS MACRO_STATE_indicators (
  id TEXT PRIMARY KEY,              -- hash(source + indicator_code + period)
  release_date TEXT NOT NULL,       -- YYYY-MM-DD, date the number was released
  period TEXT NOT NULL,             -- period the number is FOR (e.g. '2026-03' for March CPI)
  indicator_code TEXT NOT NULL,     -- CPI_HEADLINE / CPI_CORE / NFP / UNEMP / FEDFUNDS / DGS2 / DGS10 / ...
  indicator_name TEXT NOT NULL,     -- human label
  value REAL NOT NULL,
  prior REAL,
  unit TEXT,                        -- '%' / 'k' / 'bp' / 'index'
  source TEXT NOT NULL,             -- BLS / FRED / BEA
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_macro_ind_release ON MACRO_STATE_indicators(release_date);
CREATE INDEX IF NOT EXISTS idx_macro_ind_code    ON MACRO_STATE_indicators(indicator_code, release_date);

CREATE TABLE IF NOT EXISTS MACRO_STATE_fomc (
  id TEXT PRIMARY KEY,              -- hash(meeting_date)
  meeting_date TEXT NOT NULL,       -- YYYY-MM-DD, decision date
  title TEXT NOT NULL,
  decision_summary TEXT,            -- short: rate action + guidance direction
  statement_text TEXT NOT NULL,     -- full press release body
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_macro_fomc_date ON MACRO_STATE_fomc(meeting_date);

CREATE TABLE IF NOT EXISTS MACRO_STATE_news (
  id TEXT PRIMARY KEY,              -- hash(week_start + title)
  week_start TEXT NOT NULL,         -- YYYY-MM-DD, Monday of the week the story belongs to
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  url TEXT,
  sentiment TEXT,                   -- bullish/bearish/neutral
  magnitude REAL,                   -- -1.0 to +1.0
  why_it_matters TEXT,              -- one sentence: why this was the week's top macro story
  picked_by TEXT NOT NULL,          -- 'bootstrap' | 'auto' | 'manual'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_macro_news_week ON MACRO_STATE_news(week_start);
