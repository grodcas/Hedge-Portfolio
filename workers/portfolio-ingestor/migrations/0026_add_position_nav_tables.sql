-- Sprint 7: derived tables from the trade ledger.
-- POSITION_01_Daily:
--   One row per (ticker, date). Derived by replaying TRADE_01_Ledger ≤ date
--   and joining to that day's PRICE_01_Daily close. Fully rebuildable.
-- NAV_01_Daily:
--   One row per date. gross_long/net/cash/leverage/day_pnl. Aggregate of
--   POSITION_01_Daily + a starting cash constant.

CREATE TABLE IF NOT EXISTS POSITION_01_Daily (
  id TEXT PRIMARY KEY,                -- shortHash(ticker|date)
  date TEXT NOT NULL,
  ticker TEXT NOT NULL,
  qty REAL NOT NULL,
  avg_cost REAL NOT NULL,
  market_price REAL,
  market_value REAL,                  -- qty * market_price
  unrlz_pnl_usd REAL,                 -- (price - avg_cost) * qty
  day_pnl_pct REAL,                   -- (price_today - price_prev) / price_prev
  weight_pct REAL,                    -- market_value / NAV, backfilled post-NAV
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_date   ON POSITION_01_Daily(date);
CREATE INDEX IF NOT EXISTS idx_pos_ticker ON POSITION_01_Daily(ticker, date);

CREATE TABLE IF NOT EXISTS NAV_01_Daily (
  date TEXT PRIMARY KEY,              -- one row per day
  gross_long REAL NOT NULL,
  gross_short REAL NOT NULL DEFAULT 0,
  net_value REAL NOT NULL,            -- gross_long - gross_short + cash
  cash REAL NOT NULL,
  leverage REAL,                      -- (gross_long + gross_short) / net_value
  day_pnl_usd REAL,
  day_pnl_pct REAL,
  positions_count INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
