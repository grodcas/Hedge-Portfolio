-- Migration 0013: Add probability table for Bayesian daily state
CREATE TABLE IF NOT EXISTS SIGNAL_02_Probability (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  p_favorable REAL NOT NULL,
  p_neutral REAL NOT NULL,
  p_unfavorable REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prob_ticker ON SIGNAL_02_Probability(ticker, date);
