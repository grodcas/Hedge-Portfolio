-- Migration 0041: FOMC_PROJECTIONS — dot plot + SEP table.
--
-- fomc-statement-fetcher already writes the FOMC press statement to
-- MACRO_STATE_fomc. The Macro slide-out's "Last FOMC" keypoints additionally
-- need the Summary of Economic Projections (SEP) and the dot plot — both
-- published 4× per year (March / June / Sept / Dec) at the same press URL
-- pattern (fomcprojtabl{YYYYMMDD}.htm).
--
-- One row per (meeting × indicator × year × stat). Indicators:
--   GDP / UNEMPLOYMENT / PCE / CORE_PCE   — projections
--   FED_FUNDS                              — dot plot ("appropriate target rate")
-- Years: '{year}' or 'Longer run'.
-- Stats: 'median' | 'central_tendency_low' | 'central_tendency_high' |
--        'range_low' | 'range_high'.

CREATE TABLE IF NOT EXISTS FOMC_PROJECTIONS (
  id TEXT PRIMARY KEY,                  -- shortHash(SEP|meeting_date|indicator|year|stat)
  meeting_date TEXT NOT NULL,           -- YYYY-MM-DD, the FOMC decision date
  indicator TEXT NOT NULL,              -- GDP | UNEMPLOYMENT | PCE | CORE_PCE | FED_FUNDS
  year TEXT NOT NULL,                   -- '2026' | '2027' | '2028' | 'Longer run'
  stat TEXT NOT NULL,                   -- median | central_tendency_low/_high | range_low/_high
  value REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT '%',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fomc_proj_meeting
  ON FOMC_PROJECTIONS(meeting_date, indicator);
