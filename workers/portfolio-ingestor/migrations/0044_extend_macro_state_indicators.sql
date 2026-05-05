-- Migration 0044: MACRO_STATE_indicators — delta_1m + z_vs_24m on insert.
--
-- M2 (Macro Thesis) trigger needs "any panel indicator crossed |z| > 1.5"
-- comparable across releases. Storing the rolling stats on insert (in
-- macro-state-fetcher, MS-1b) is cheaper and easier to reason about than
-- recomputing in every agent prompt.
--
-- Backfill is intentionally skipped: macro-state-fetcher will populate these
-- on its next run. Existing rows keep null — orchestrator treats null as
-- "below epsilon" and won't fire on stale rows.

ALTER TABLE MACRO_STATE_indicators ADD COLUMN delta_1m REAL;
ALTER TABLE MACRO_STATE_indicators ADD COLUMN z_vs_24m REAL;
