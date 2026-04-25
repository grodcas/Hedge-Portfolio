-- Migration 0022: Stock-level industry-standard factor table + Piotroski feedstock on FUND_01
--
-- Part A extends FUND_01_Fundamentals with raw statement fields and derived
-- per-year ratios needed to compute the 9 Piotroski F-Score signals. These
-- are populated by src/steps/fetch-fundamentals.js calling AV INCOME_STATEMENT,
-- BALANCE_SHEET, and CASH_FLOW endpoints alongside OVERVIEW.
--
-- Part B creates STOCK_FACTORS_daily — the per-ticker-per-day table holding
-- 9 industry-standard equity factors (Fwd P/E, Rel P/E σ vs peers, EPS Rev 4w,
-- Rev Breadth 4w, SUE, 12-1 Mom, 3m RS vs sector, Piotroski F, days-to-catalyst),
-- populated daily by stock-factor-builder at wave 1500.

-- ========== Part A: Extend FUND_01_Fundamentals ==========

ALTER TABLE FUND_01_Fundamentals ADD COLUMN sector TEXT;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN total_assets REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN total_assets_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN total_debt REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN total_debt_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN shares_outstanding REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN shares_outstanding_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN net_income REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN net_income_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN revenue_annual REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN revenue_annual_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN gross_profit REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN gross_profit_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN cfo REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN cfo_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN roa REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN roa_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN current_ratio REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN current_ratio_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN gross_margin_annual REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN gross_margin_annual_prev REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN asset_turnover REAL;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN asset_turnover_prev REAL;

-- ========== Part B: STOCK_FACTORS_daily ==========

CREATE TABLE IF NOT EXISTS STOCK_FACTORS_daily (
  id TEXT PRIMARY KEY,                  -- hash(ticker|date)
  ticker TEXT NOT NULL,
  date DATE NOT NULL,
  sector TEXT,
  fwd_pe REAL,
  rel_pe_sigma REAL,                    -- (fwd_pe - peer_median) / peer_sigma
  eps_rev_4w REAL,                      -- mean % change in analyst EPS estimate over 4w
  rev_breadth_4w REAL,                  -- (up_recs - down_recs) / total over 4w
  sue REAL,                             -- (actual - estimate) / sigma(estimate) from FUND_02
  mom_12_1 REAL,                        -- return over t-252..t-21, Jegadeesh-Titman
  rs_vs_sector_3m REAL,                 -- ticker 63d return - sector ETF 63d return
  piotroski_f INTEGER,                  -- 0..9, sum of 9 binary signals
  days_to_catalyst INTEGER,             -- days until next scheduled earnings
  short_pct_float REAL,                 -- nullable, deferred (Finnhub short interest)
  peer_median_pe REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stockfactors_ticker_date ON STOCK_FACTORS_daily(ticker, date);
CREATE INDEX IF NOT EXISTS idx_stockfactors_date        ON STOCK_FACTORS_daily(date);
CREATE INDEX IF NOT EXISTS idx_stockfactors_sector_date ON STOCK_FACTORS_daily(sector, date);
