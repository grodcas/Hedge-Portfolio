-- Migration: Add PROC_01_Pipeline_logs table for pipeline validation results
-- This table stores the full validation output from each pipeline run

CREATE TABLE IF NOT EXISTS PROC_01_Pipeline_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  summary TEXT,
  validations TEXT,
  logs TEXT,
  created_at TEXT NOT NULL
);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_pipeline_logs_date ON PROC_01_Pipeline_logs(date);
