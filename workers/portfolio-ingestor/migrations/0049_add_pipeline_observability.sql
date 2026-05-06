-- Migration 0049: pipeline observability tables for the Validator tab.
--
-- Two sources of truth, surfaced together on a new Validator tab:
--
--   PROC_03_Pipeline_runs  — one row per (run_date, step_name).
--                            answers "did every cron pipeline step succeed
--                            last night?"
--   PROC_04_API_usage      — one row per (run_date, caller, api, endpoint).
--                            answers "what is today's API spend so I never
--                            find a huge bill?"
--
-- Both are upserted (date-keyed primary keys), so multiple writes per day
-- bump the same row instead of accumulating duplicates.

CREATE TABLE IF NOT EXISTS PROC_03_Pipeline_runs (
  run_date     TEXT NOT NULL,            -- YYYY-MM-DD
  step_name    TEXT NOT NULL,            -- 'PRESS' | 'WH' | 'EDGAR' | ...
  status       TEXT NOT NULL,            -- 'ok' | 'warn' | 'fail' | 'skip'
  items        INTEGER,                  -- items written / processed
  started_at   TEXT,                     -- ISO timestamp
  completed_at TEXT,
  duration_ms  INTEGER,
  error        TEXT,                     -- null on ok
  log_excerpt  TEXT,                     -- last ~500 chars of step log
  PRIMARY KEY (run_date, step_name)
);

CREATE INDEX IF NOT EXISTS idx_proc03_date
  ON PROC_03_Pipeline_runs(run_date);


CREATE TABLE IF NOT EXISTS PROC_04_API_usage (
  run_date    TEXT NOT NULL,             -- YYYY-MM-DD
  caller      TEXT NOT NULL,             -- 'fetch-fundamentals' | 'consensus-fetcher' | ...
  api         TEXT NOT NULL,             -- 'alphavantage' | 'openai' | 'gemini' | ...
  endpoint    TEXT NOT NULL DEFAULT '',  -- '' for "all endpoints", or e.g. 'gpt-5-mini'
  calls       INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL,                      -- nullable for unmetered APIs
  budget_cap  INTEGER,                   -- 25 for AV; null otherwise
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (run_date, caller, api, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_proc04_date
  ON PROC_04_API_usage(run_date);
CREATE INDEX IF NOT EXISTS idx_proc04_api_date
  ON PROC_04_API_usage(api, run_date);
