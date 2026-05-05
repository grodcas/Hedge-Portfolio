-- Migration 0043: FUND_03_Estimates — sell-side consensus per ticker.
--
-- Feeds Ticker agent #3 (Estimates reading). One row per (ticker, fiscal year)
-- — typically FY, FY+1, FY+2. Writer (`consensus-fetcher`) ships in MS-1e and
-- pulls Finnhub /stock/eps-estimate?freq=annual + /stock/revenue-estimate.
--
-- Idempotent on id = hash(ticker|period_kind|period_label).

CREATE TABLE IF NOT EXISTS FUND_03_Estimates (
  id TEXT PRIMARY KEY,              -- hash(ticker|period_kind|period_label)
  ticker TEXT NOT NULL,
  period_label TEXT NOT NULL,       -- e.g. 'FY2026', 'Q3-2026'
  period_kind TEXT NOT NULL,        -- 'annual' | 'quarterly'
  fiscal_year INTEGER,              -- 2026 / 2027 / 2028 ...
  eps_consensus REAL,
  rev_consensus REAL,               -- in USD (raw — caller decides scaling)
  eps_revisions_30d INTEGER,        -- net up - net down over trailing 30 days
  rev_revisions_30d INTEGER,
  eps_dispersion REAL,              -- stdev of analyst estimates
  source TEXT,                      -- 'finnhub' (room for refinitiv/zacks later)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fund03_ticker      ON FUND_03_Estimates(ticker, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fund03_ticker_kind ON FUND_03_Estimates(ticker, period_kind, fiscal_year);
