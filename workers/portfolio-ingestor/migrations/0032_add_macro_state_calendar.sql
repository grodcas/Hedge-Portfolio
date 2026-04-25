-- Migration 0032: forward-looking economic calendar.
-- Sprint 11: replaces GPT-generated `catalysts[]` in BETA_10_Daily_macro with
-- a real Finnhub-sourced release schedule. Populated daily by
-- workers/economic-calendar-fetcher/ (cron 0 0 * * *).

CREATE TABLE IF NOT EXISTS MACRO_STATE_calendar (
  id TEXT PRIMARY KEY,              -- hash(event_date|event_code|country)
  event_date TEXT NOT NULL,         -- ISO YYYY-MM-DD (UTC)
  event_time TEXT,                  -- UTC HH:MM:SS, null for date-only
  country TEXT NOT NULL,            -- 'US','EU',...
  event_code TEXT NOT NULL,         -- 'FOMC','CPI','PCE','NFP','GDP_ADV',...
  event_label TEXT NOT NULL,        -- raw Finnhub name
  impact TEXT,                      -- 'high' | 'medium' | 'low'
  consensus TEXT,                   -- Finnhub 'estimate' when non-null
  prior TEXT,                       -- Finnhub 'prev' when non-null
  unit TEXT,                        -- e.g. '%', 'K', '$B'
  source TEXT NOT NULL,             -- 'finnhub' for now
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cal_date ON MACRO_STATE_calendar(event_date);
CREATE INDEX IF NOT EXISTS idx_cal_country_impact ON MACRO_STATE_calendar(country, impact);
