-- Migration 0036: FUND_01_Quarterly — full quarter-by-quarter history.
--
-- Today fetch-fundamentals.js keeps only quarterlyReports[0] (current) and [4]
-- (YoY same-quarter) from each AV statement endpoint. The middle 6 quarters
-- (and quarters 8..19) are dropped. The v2-balanced mockup's Book sparklines
-- (8q margin / 8q FCF) and the Name slide-out's 20q Fundamentals charts need
-- the full history — once persisted, they populate immediately for any quarter
-- AV's `quarterlyReports` array still carries (typically 20 quarters / 5y).
--
-- Companion table: one row per ticker × fiscal_period_ending. Merged across
-- IS / BS / CF — fields land as null when the relevant statement endpoint
-- didn't run that day (statement endpoints are event-driven by SEC 10-Q
-- filings, so a daily run produces only the touched tickers' quarters).

CREATE TABLE IF NOT EXISTS FUND_01_Quarterly (
  id TEXT PRIMARY KEY,                   -- shortHash(ticker|fiscal_period_ending)
  ticker TEXT NOT NULL,
  fiscal_period_ending TEXT NOT NULL,    -- YYYY-MM-DD, AV's fiscalDateEnding

  -- Income statement
  total_revenue REAL,
  gross_profit REAL,
  operating_income REAL,
  net_income REAL,
  rd_expense REAL,
  sga_expense REAL,
  interest_expense REAL,
  ebit REAL,
  ebitda REAL,

  -- Balance sheet
  total_assets REAL,
  total_liabilities REAL,
  total_equity REAL,
  current_assets REAL,
  current_liabilities REAL,
  inventory REAL,
  receivables REAL,
  cash_and_equivalents REAL,
  short_term_debt REAL,
  long_term_debt REAL,
  shares_outstanding REAL,

  -- Cash flow
  cfo REAL,
  capex REAL,
  cfi REAL,
  cff REAL,
  dividends_paid REAL,
  buyback REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_q_ticker_period
  ON FUND_01_Quarterly(ticker, fiscal_period_ending);

CREATE INDEX IF NOT EXISTS idx_fund_q_period
  ON FUND_01_Quarterly(fiscal_period_ending);
