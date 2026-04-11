-- News Funnel digest: final filtered + summarized headlines
-- Per-ticker (1-4 items/day) and Macro (10 items/day)
CREATE TABLE IF NOT EXISTS BETA_12_News_digest (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'ticker' or 'macro'
  ticker TEXT,                 -- ticker symbol for type='ticker', NULL for macro
  category TEXT,               -- NULL for ticker; geopolitics/trade/central_banks/etc for macro
  rank INTEGER NOT NULL,       -- 1 = most important
  title TEXT NOT NULL,
  summary TEXT,                -- Gemini-generated summary (2-3 sentences)
  impact TEXT,                 -- relevance/portfolio_impact explanation
  source TEXT,                 -- news source name
  sentiment TEXT,              -- bullish/bearish/neutral
  magnitude REAL,              -- -1.0 to +1.0
  frequency INTEGER DEFAULT 1, -- how many times this story appeared across sources
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_news_digest_date ON BETA_12_News_digest(date);
CREATE INDEX IF NOT EXISTS idx_news_digest_ticker ON BETA_12_News_digest(ticker, date);
CREATE INDEX IF NOT EXISTS idx_news_digest_type ON BETA_12_News_digest(type, date);
