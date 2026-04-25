-- Migration 0023: Sector-level factor + flow tables for Portfolio Layer 2
--
-- SECTOR_FACTORS_daily is populated by sector-factor-builder (wave 1600)
-- aggregating STOCK_FACTORS_daily + PRICE_01_Daily (sector ETFs) + latest
-- BETA_10_Daily_macro regime.
--
-- SECTOR_FLOWS_daily is schema-only for now — etf-flows-fetcher is deferred
-- (Finnhub /etf/profile coverage uncertain, SSGA scraping too brittle).
-- sector-factor-builder emits flow_5d = null until the fetcher ships.

CREATE TABLE IF NOT EXISTS SECTOR_FLOWS_daily (
  id TEXT PRIMARY KEY,               -- hash(etf_ticker|date)
  sector TEXT NOT NULL,
  etf_ticker TEXT NOT NULL,
  date DATE NOT NULL,
  shares_outstanding REAL,
  nav REAL,
  flow_usd REAL,                     -- Δshares × nav
  aum REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sectorflows_sector_date ON SECTOR_FLOWS_daily(sector, date);
CREATE INDEX IF NOT EXISTS idx_sectorflows_date        ON SECTOR_FLOWS_daily(date);

CREATE TABLE IF NOT EXISTS SECTOR_FACTORS_daily (
  id TEXT PRIMARY KEY,               -- hash(sector|date)
  sector TEXT NOT NULL,
  date DATE NOT NULL,
  regime_fit REAL,                   -- regime×sector affinity score, [-1, +1]
  earn_momentum REAL,                -- mean of constituent eps_rev_4w
  beat_rate_sector REAL,             -- frac of constituents with sue > 0
  valuation_sigma REAL,              -- z-score of sector fwd_pe vs 252d rolling (NULL until history)
  rel_strength_13w REAL,             -- sector ETF 63d return − SPY 63d return
  rs_ratio REAL,                     -- JdK RRG x-axis, centered at 100
  rs_momentum REAL,                  -- JdK RRG y-axis, centered at 100
  flow_5d REAL,                      -- nullable, deferred
  stance_score REAL,                 -- weighted sum, null-aware renormalization
  stance TEXT,                       -- OW / EW / UW
  fwd_pe_sector REAL,                -- median of constituent fwd_pe
  breadth_above_200dma REAL,         -- frac of constituents with close > dma_200
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sectorfactors_sector_date ON SECTOR_FACTORS_daily(sector, date);
CREATE INDEX IF NOT EXISTS idx_sectorfactors_date        ON SECTOR_FACTORS_daily(date);
