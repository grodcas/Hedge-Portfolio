-- Sprint 7: append-only trade ledger.
-- Each row = one fill. Corrections = reversing trades, never UPDATE.
-- id = shortHash(ticker|trade_date|side|qty|price) for idempotent upsert.

CREATE TABLE IF NOT EXISTS TRADE_01_Ledger (
  id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,           -- YYYY-MM-DD
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  qty REAL NOT NULL,                  -- positive always; side carries direction
  price REAL NOT NULL,                -- per-share USD
  fees REAL DEFAULT 0,
  notes TEXT,                         -- 'SEED' flags synthetic seed rows
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trade_date   ON TRADE_01_Ledger(trade_date);
CREATE INDEX IF NOT EXISTS idx_trade_ticker ON TRADE_01_Ledger(ticker, trade_date);
