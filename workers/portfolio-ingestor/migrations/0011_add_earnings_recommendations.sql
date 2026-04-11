-- Migration 0011: Add earnings and analyst recommendations tables for Finnhub data
CREATE TABLE IF NOT EXISTS FUND_02_Earnings (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  period TEXT NOT NULL,
  estimate REAL,
  actual REAL,
  surprise REAL,
  surprise_pct REAL,
  report_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_earnings_ticker ON FUND_02_Earnings(ticker, period);

CREATE TABLE IF NOT EXISTS FUND_03_Recommendations (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  strong_buy INTEGER,
  buy INTEGER,
  hold INTEGER,
  sell INTEGER,
  strong_sell INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recs_ticker ON FUND_03_Recommendations(ticker, date);
