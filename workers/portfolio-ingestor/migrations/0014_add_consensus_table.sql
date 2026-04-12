-- Migration 0014: Add consensus validation table
CREATE TABLE IF NOT EXISTS SIGNAL_03_Consensus (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  target TEXT NOT NULL,
  our_conclusion TEXT,
  dominant_narrative TEXT,
  consensus_level REAL,
  missed_factors TEXT,
  strongest_counter TEXT,
  confidence TEXT,
  search_sources TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consensus_date ON SIGNAL_03_Consensus(date);
CREATE INDEX IF NOT EXISTS idx_consensus_target ON SIGNAL_03_Consensus(target, date);
