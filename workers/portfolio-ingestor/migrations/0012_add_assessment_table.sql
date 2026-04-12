-- Migration 0012: Add assessment table for daily composite scores
CREATE TABLE IF NOT EXISTS SIGNAL_01_Assessment (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  score REAL NOT NULL,
  factors_json TEXT NOT NULL,
  explanation TEXT,
  sources_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_ticker ON SIGNAL_01_Assessment(ticker, date);
CREATE INDEX IF NOT EXISTS idx_assessment_date ON SIGNAL_01_Assessment(date);
