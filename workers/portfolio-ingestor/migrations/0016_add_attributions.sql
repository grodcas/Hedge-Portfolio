-- Migration 0016: Add event attribution table
-- Stores daily diagnostic results from event-attribution-engine:
-- classifies each movement as macro/sector/company and attributes
-- company-specific moves to recorded events using lag-weighted scoring.
CREATE TABLE IF NOT EXISTS SIGNAL_04_Attributions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  ticker_return REAL,
  sector_return REAL,
  spy_return REAL,
  company_alpha REAL,
  top_event_type TEXT,
  top_event_id TEXT,
  top_event_date TEXT,
  top_event_lag INTEGER,
  top_event_weight REAL,
  explanation TEXT,
  candidates_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attr_ticker ON SIGNAL_04_Attributions(ticker, date);
CREATE INDEX IF NOT EXISTS idx_attr_date ON SIGNAL_04_Attributions(date);
