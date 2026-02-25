-- PROC_04_Fact_verification - Stores AI summary fact verification results
-- Part of Phase 6: Integrate fact-checking agents

CREATE TABLE IF NOT EXISTS PROC_04_Fact_verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Reference to the summary being verified
  summary_id VARCHAR NOT NULL,           -- ID from source table (e.g., report ID, cluster ID)
  summary_table VARCHAR NOT NULL,        -- Which table: ALPHA_01_Reports, ALPHA_02_Clusters, etc.

  -- The extracted fact
  fact_claim TEXT NOT NULL,              -- The factual claim extracted from summary
  fact_type VARCHAR,                     -- "numeric" or "qualitative"

  -- Verification against source
  source_id VARCHAR,                     -- ID of source document used for verification
  source_location VARCHAR,               -- "line:123,char:456" or cluster reference
  source_quote TEXT,                     -- Exact quote from source (if found)

  -- Verification result
  status VARCHAR NOT NULL,               -- VERIFIED | PARTIALLY_VERIFIED | NOT_FOUND | CONTRADICTED
  confidence REAL,                       -- 0.0 to 1.0

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for looking up all facts for a given summary
CREATE INDEX IF NOT EXISTS idx_fact_summary
  ON PROC_04_Fact_verification(summary_id, summary_table);

-- Index for finding problematic facts
CREATE INDEX IF NOT EXISTS idx_fact_status
  ON PROC_04_Fact_verification(status);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_fact_created
  ON PROC_04_Fact_verification(created_at);
