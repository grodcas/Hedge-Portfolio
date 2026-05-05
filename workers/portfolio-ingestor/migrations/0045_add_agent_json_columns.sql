-- Migration 0045: per-agent JSON columns across the three narrative tables.
--
-- Bundled to avoid 24 separate migrations. Each agent writes a triplet:
--   <name>_json         -- the agent's structured output (full JSON blob)
--   <name>_updated_at   -- ISO timestamp the row was written
--   <name>_model        -- the LLM model id used (lets us track gpt-5 vs gpt-5-mini)
--
-- BETA_10_Daily_macro  — 7 macro agents (M1..M7)
-- SECTOR_TREND_long    — 6 sector agents (S1..S6)
-- TICKER_TREND_long    — 11 ticker agents
--
-- Tape annotation (the 25th agent) lives on MOVER_EXPLANATIONS_daily and is
-- added in MS-3i, not here.
--
-- Note: SECTOR_TREND_long and TICKER_TREND_long already have a `thesis`
-- (TEXT) column from migration 0020/0024. The new `thesis_json` coexists;
-- the legacy column will be reconciled in MS-5c (column audit).

------------------------------------------------------------------------
-- BETA_10_Daily_macro — 7 macro agents
------------------------------------------------------------------------

ALTER TABLE BETA_10_Daily_macro ADD COLUMN news_drift_json        TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN news_drift_updated_at  TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN news_drift_model       TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN thesis_json            TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN thesis_updated_at      TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN thesis_model           TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN notes_json             TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN notes_updated_at       TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN notes_model            TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN positioning_json       TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN positioning_updated_at TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN positioning_model      TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN signposts_json         TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN signposts_updated_at   TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN signposts_model        TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN read_json              TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN read_updated_at        TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN read_model             TEXT;

ALTER TABLE BETA_10_Daily_macro ADD COLUMN fomc_summary_json       TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN fomc_summary_updated_at TEXT;
ALTER TABLE BETA_10_Daily_macro ADD COLUMN fomc_summary_model      TEXT;

------------------------------------------------------------------------
-- SECTOR_TREND_long — 6 sector agents
------------------------------------------------------------------------

ALTER TABLE SECTOR_TREND_long ADD COLUMN news_drift_json         TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN news_drift_updated_at   TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN news_drift_model        TEXT;

ALTER TABLE SECTOR_TREND_long ADD COLUMN thesis_json             TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN thesis_updated_at       TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN thesis_model            TEXT;

ALTER TABLE SECTOR_TREND_long ADD COLUMN notes_json              TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN notes_updated_at        TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN notes_model             TEXT;

ALTER TABLE SECTOR_TREND_long ADD COLUMN implementation_json       TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN implementation_updated_at TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN implementation_model      TEXT;

ALTER TABLE SECTOR_TREND_long ADD COLUMN hedges_json             TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN hedges_updated_at       TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN hedges_model            TEXT;

ALTER TABLE SECTOR_TREND_long ADD COLUMN read_json               TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN read_updated_at         TEXT;
ALTER TABLE SECTOR_TREND_long ADD COLUMN read_model              TEXT;

------------------------------------------------------------------------
-- TICKER_TREND_long — 11 ticker agents
------------------------------------------------------------------------

ALTER TABLE TICKER_TREND_long ADD COLUMN valuation_json          TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN valuation_updated_at    TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN valuation_model         TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN fundamentals_json       TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN fundamentals_updated_at TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN fundamentals_model      TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN estimates_json          TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN estimates_updated_at    TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN estimates_model         TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN peers_json              TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN peers_updated_at        TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN peers_model             TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN context_json            TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN context_updated_at      TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN context_model           TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN news_drift_json         TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN news_drift_updated_at   TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN news_drift_model        TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN thesis_json             TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN thesis_updated_at       TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN thesis_model            TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN notes_json              TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN notes_updated_at        TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN notes_model             TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN recommendation_json       TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN recommendation_updated_at TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN recommendation_model      TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN read_json               TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN read_updated_at         TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN read_model              TEXT;

ALTER TABLE TICKER_TREND_long ADD COLUMN earnings_summary_json       TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN earnings_summary_updated_at TEXT;
ALTER TABLE TICKER_TREND_long ADD COLUMN earnings_summary_model      TEXT;
