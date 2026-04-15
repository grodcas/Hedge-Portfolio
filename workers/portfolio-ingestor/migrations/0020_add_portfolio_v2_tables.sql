-- Portfolio v2 foundation: holdings, signal history, long/short ticker trends,
-- sector operations, and rebalance snapshots.
--
-- Follows the macro-state precedent: compact stores the LLM layer can read
-- cheaply, with deterministic IDs so re-runs are idempotent.

-- User's current portfolio positions. Edited manually or by an import step.
-- Wealth-distribution call reads this as the "current" to adapt from.
CREATE TABLE IF NOT EXISTS PORTFOLIO_01_Holdings (
  ticker TEXT PRIMARY KEY,
  shares REAL,                      -- position size; optional if weight_pct is set
  avg_cost REAL,                    -- weighted average cost basis
  weight_pct REAL,                  -- static target weight (used when shares are unknown)
  notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Append-only daily sentiment + event flags per ticker.
-- Feeds the 14-bar persistence strip. One row per (date, ticker).
CREATE TABLE IF NOT EXISTS SIGNAL_HISTORY_daily (
  id TEXT PRIMARY KEY,              -- hash(date + ticker)
  date TEXT NOT NULL,
  ticker TEXT NOT NULL,
  sentiment_score REAL,             -- -1.0 .. +1.0, aggregated from today's news
  magnitude REAL,                   -- 0.0 .. 1.0, how material
  news_count INTEGER DEFAULT 0,
  earnings_flag INTEGER DEFAULT 0,  -- 1 if an earnings report lands today
  trend_updated INTEGER DEFAULT 0,  -- 1 if short-term trend fired today
  top_headline TEXT,                -- headline that drove the day
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sig_hist_date   ON SIGNAL_HISTORY_daily(date);
CREATE INDEX IF NOT EXISTS idx_sig_hist_ticker ON SIGNAL_HISTORY_daily(ticker, date);

-- Long-term trend per ticker: slow baseline built from the 4 latest
-- 10-K/10-Q filings + 4 latest earnings. Updates on new report landing.
-- One row per ticker (upsert-in-place). raw_blob holds full LLM JSON.
CREATE TABLE IF NOT EXISTS TICKER_TREND_long (
  ticker TEXT PRIMARY KEY,
  as_of TEXT NOT NULL,              -- YYYY-MM-DD, when last updated
  updated_by TEXT,                  -- id of the report/earnings that triggered (or 'bootstrap')
  regime TEXT,                      -- bullish|cautious_bullish|neutral|cautious_bearish|bearish
  score REAL,                       -- -1.0 .. +1.0
  thesis TEXT,                      -- one-sentence summary
  drivers TEXT,                     -- JSON [{text, bias}]
  narrative TEXT,                   -- JSON [{text, bias}]
  raw_blob TEXT,                    -- full LLM output for audit
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Short-term trend per ticker: tactical overlay that fires on triggers
-- (important news, press release, price move, or 7-day staleness floor).
-- One row per ticker (upsert-in-place).
CREATE TABLE IF NOT EXISTS TICKER_TREND_short (
  ticker TEXT PRIMARY KEY,
  as_of TEXT NOT NULL,
  trigger TEXT,                     -- 'news' | 'press' | 'price_move' | 'stale' | 'earnings'
  trigger_detail TEXT,              -- short sentence explaining what fired
  regime TEXT,
  score REAL,
  thesis TEXT,
  drivers TEXT,                     -- JSON [{text, bias}]
  narrative TEXT,                   -- JSON [{text, bias}]
  raw_blob TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-sector operation bundles. NOT daily — one row per (sector, creation time).
-- Superseded by a newer bundle when the sector gets a fresh trigger.
-- Relevance score fades with time via a computed function at read time.
CREATE TABLE IF NOT EXISTS OPERATION_01_Signals (
  id TEXT PRIMARY KEY,              -- hash(sector + created_at)
  sector TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_confirmed_at DATETIME,       -- when the agent last re-validated this bundle
  trigger_reason TEXT,              -- what fired the update
  operations TEXT NOT NULL,         -- JSON [{action, ticker, counter_ticker, risk, thesis, bullets[]}]
  macro_context TEXT,               -- JSON snapshot of macro regime at creation
  relevance_score REAL,             -- 0.0 .. 1.0 at creation; UI fades it over time
  superseded_by TEXT                -- id of replacement bundle (NULL = active)
);
CREATE INDEX IF NOT EXISTS idx_ops_sector_active ON OPERATION_01_Signals(sector, superseded_by);

-- Wealth distribution snapshots. Written by the rebalance agent which takes
-- current holdings + latest active operations and outputs a target
-- distribution + deltas. Adaptive: small changes, stable over weeks.
CREATE TABLE IF NOT EXISTS REBALANCE_01 (
  id TEXT PRIMARY KEY,              -- hash(created_at)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  triggered_by TEXT,                -- id of the operation bundle that caused this rebalance
  current_weights TEXT NOT NULL,    -- JSON {ticker: pct}
  target_weights TEXT NOT NULL,     -- JSON {ticker: pct}
  deltas TEXT NOT NULL,             -- JSON {ticker: pct_delta}
  rationale TEXT,                   -- JSON [{text, bias}]
  raw_blob TEXT
);
CREATE INDEX IF NOT EXISTS idx_rebalance_created ON REBALANCE_01(created_at);
