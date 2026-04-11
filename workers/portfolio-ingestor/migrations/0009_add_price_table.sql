-- Migration 0009: Add daily price table for Polygon.io OHLCV data
CREATE TABLE IF NOT EXISTS PRICE_01_Daily (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_daily_ticker ON PRICE_01_Daily(ticker, date);
CREATE INDEX IF NOT EXISTS idx_price_daily_date ON PRICE_01_Daily(date);
