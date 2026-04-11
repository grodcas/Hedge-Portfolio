-- Migration 0010: Add fundamentals table for Alpha Vantage OVERVIEW data
CREATE TABLE IF NOT EXISTS FUND_01_Fundamentals (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  pe_ratio REAL,
  forward_pe REAL,
  eps REAL,
  revenue_ttm REAL,
  profit_margin REAL,
  operating_margin REAL,
  market_cap REAL,
  week_52_high REAL,
  week_52_low REAL,
  dma_50 REAL,
  dma_200 REAL,
  analyst_target REAL,
  dividend_yield REAL,
  beta REAL,
  raw_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fund_ticker ON FUND_01_Fundamentals(ticker, date);
