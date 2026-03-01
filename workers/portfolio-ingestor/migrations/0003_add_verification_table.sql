-- Migration: Add GAMMA_01_Verification table for AI fact verification results
-- This table stores fact verification results from the daily pipeline

CREATE TABLE IF NOT EXISTS GAMMA_01_Verification (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  summary_id TEXT NOT NULL,
  summary_type TEXT NOT NULL,
  total_facts INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  not_found INTEGER DEFAULT 0,
  contradicted INTEGER DEFAULT 0,
  score REAL DEFAULT 0,
  issues TEXT,
  created_at TEXT NOT NULL
);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_verification_date ON GAMMA_01_Verification(date);
