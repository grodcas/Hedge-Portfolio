-- 0051_add_cron_runs.sql
-- One row per cron fire from a Tier-1 cron entry-point. Filled by
-- _shared/cron-log.js wrapping each scheduled() handler. Fed to the
-- cron-watchdog worker's /status endpoint so silent misses surface
-- within the hour instead of after dashboard inspection.

CREATE TABLE IF NOT EXISTS PROC_05_Cron_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  worker        TEXT    NOT NULL,
  fired_at      TEXT    NOT NULL,
  ok            INTEGER NOT NULL,
  duration_ms   INTEGER,
  rows_written  INTEGER,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_worker_fired
  ON PROC_05_Cron_runs(worker, fired_at DESC);
