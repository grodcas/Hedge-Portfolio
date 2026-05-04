-- Migration 0040: SENTIMENT_STATE_indicators — typed mirror of BETA_04_Sentiment.
--
-- BETA_04_Sentiment stores Put/Call ratios (CBOE), AAII bull/neutral/bearish,
-- and COT futures positioning (ES + NQ asset-mgr / leveraged-fund nets) as
-- JSON blobs in `summary`. The v2-balanced cross-asset Vol·Positioning column
-- needs them as typed indicator rows so the dashboard can display them
-- alongside MACRO_STATE_indicators using the same shape.
--
-- Same schema as MACRO_STATE_indicators. Written by sentiment-state-fetcher
-- worker (00:25 UTC daily) which reads BETA_04_Sentiment, parses the blob,
-- and writes one typed row per sub-feed value.

CREATE TABLE IF NOT EXISTS SENTIMENT_STATE_indicators (
  id TEXT PRIMARY KEY,                      -- shortHash(SENTIMENT|code|date)
  release_date TEXT NOT NULL,               -- ISO YYYY-MM-DD
  period TEXT NOT NULL,                     -- usually = release_date for daily indicators
  indicator_code TEXT NOT NULL,             -- PUTCALL_EQUITY / AAII_BULL_BEAR / COT_ES_AM_NET / ...
  indicator_name TEXT NOT NULL,
  value REAL NOT NULL,
  prior REAL,
  unit TEXT,                                -- 'ratio' | '%' | 'contracts'
  source TEXT NOT NULL,                     -- 'CBOE' | 'AAII' | 'CFTC'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sentiment_state_code
  ON SENTIMENT_STATE_indicators(indicator_code, release_date);

CREATE INDEX IF NOT EXISTS idx_sentiment_state_date
  ON SENTIMENT_STATE_indicators(release_date);
