-- Migration 0035: Promote FUND_01_Fundamentals raw_json multiples to typed columns.
--
-- Until now the AV OVERVIEW response was stored as a JSON blob in raw_json
-- and the dashboard couldn't sort/filter on PEG / EV-EBITDA / EV-Sales / P-B /
-- P-S / ROE / ROA. The v2-balanced mockup's Valuation Stack table reads these
-- multiples directly. SQL aggregation also needs them indexed for the own-5y
-- z-score calc on each multiple.
--
-- Forward-only: existing rows have raw_json populated; new daily writes will
-- fill the typed columns going forward. A backfill job can populate the
-- typed columns from raw_json in a future sprint if needed.

ALTER TABLE FUND_01_Fundamentals ADD COLUMN peg_ratio REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN ev_ebitda REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN ev_sales  REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN pb_ratio  REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN ps_ratio  REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN roe_ttm   REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN roa_ttm   REAL;

-- Composite index on (ticker, date) already exists — z-score queries hit it.
