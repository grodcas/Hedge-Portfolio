-- Migration 0033: Valuation curves (Sprint 12)
--
-- Two curves per ticker, in absolute $, produced by the valuation-curve-builder
-- worker. Each row is a snapshot: one per build/review.
--
-- Design (agreed with user, see NARRATIVE_PHASE_2_PLAN § Sprint 12):
--  - SHORT curve: triggered by news/press/revision events. LLM is NOT shown
--    the stock price. Fast-reacting, price-independent tactical fair value.
--  - LONG curve: bimonthly floor + structural events (10-K, 10-Q, earnings,
--    FOMC). LLM is shown the price, but only for deviation-narrative context
--    under an explicit anchor-independence constraint. Between reviews the
--    long curve is flat (step function on the chart).
--  - REALIZED table: /realize pass marks whether price converged toward the
--    curve over 21d windows. Builds a calibration track record.

-- ========== SIGNAL_03_ValuationCurve_short ==========
-- Event-triggered, price-blind LLM.
CREATE TABLE IF NOT EXISTS SIGNAL_03_ValuationCurve_short (
  id TEXT PRIMARY KEY,                  -- hash(ticker|as_of|'short')
  ticker TEXT NOT NULL,
  as_of TEXT NOT NULL,                  -- ISO datetime; one row per build
  fair_value REAL NOT NULL,             -- $ value
  baseline_fair_value REAL,             -- the long-curve value the short is adjusting
  adjustment_pct REAL,                  -- short vs baseline, %
  contributing_events_json TEXT,        -- [{event_type, event_id, delta_pct, reason}]
  trigger_event_id TEXT,                -- the event that fired this build, nullable
  model TEXT NOT NULL,                  -- 'gpt-5' typically
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_val_short_ticker_date ON SIGNAL_03_ValuationCurve_short(ticker, as_of);
CREATE INDEX IF NOT EXISTS idx_val_short_as_of       ON SIGNAL_03_ValuationCurve_short(as_of);

-- ========== SIGNAL_03_ValuationCurve_long ==========
-- Bimonthly review + structural events. Price-aware, anchor-independence
-- constrained in prompt.
CREATE TABLE IF NOT EXISTS SIGNAL_03_ValuationCurve_long (
  id TEXT PRIMARY KEY,                  -- hash(ticker|as_of|'long')
  ticker TEXT NOT NULL,
  as_of TEXT NOT NULL,                  -- review date
  fair_value REAL NOT NULL,             -- $ value
  previous_fair_value REAL,             -- prior review's fair value
  market_price_at_review REAL,          -- snapshot of price at review time
  deviation_pct REAL,                   -- (fair - price) / price * 100
  rationale TEXT NOT NULL,              -- LLM 2-3 sentence rationale
  key_events_cited_json TEXT,           -- [event_id, ...]
  would_change_mind_if_json TEXT,       -- [trigger sentence, ...]
  trigger_reason TEXT NOT NULL,         -- 'bimonthly_floor' | 'earnings' | '10-K' | '10-Q' | 'fomc' | 'manual'
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_val_long_ticker_date ON SIGNAL_03_ValuationCurve_long(ticker, as_of);
CREATE INDEX IF NOT EXISTS idx_val_long_as_of       ON SIGNAL_03_ValuationCurve_long(as_of);

-- ========== SIGNAL_03_ValuationRealized ==========
-- Calibration tracking: did the market move toward the curves over the window?
CREATE TABLE IF NOT EXISTS SIGNAL_03_ValuationRealized (
  id TEXT PRIMARY KEY,                  -- hash(ticker|forecast_date|curve_type|horizon)
  ticker TEXT NOT NULL,
  forecast_curve_id TEXT NOT NULL,      -- FK-ish: either SIGNAL_03_ValuationCurve_short.id or _long.id
  curve_type TEXT NOT NULL,             -- 'short' | 'long'
  forecast_date TEXT NOT NULL,
  realized_date TEXT NOT NULL,
  horizon_days INTEGER NOT NULL,        -- 5 or 21
  forecast_fair_value REAL NOT NULL,
  price_at_forecast REAL NOT NULL,
  price_at_realized REAL NOT NULL,
  gap_at_forecast_pct REAL NOT NULL,    -- (fair - price) / price * 100, at forecast time
  gap_closed_pct REAL,                  -- how much of that gap price closed toward fair
  converged INTEGER,                    -- 1 if price moved toward fair, 0 if moved away
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_val_realized_date      ON SIGNAL_03_ValuationRealized(forecast_date);
CREATE INDEX IF NOT EXISTS idx_val_realized_ticker    ON SIGNAL_03_ValuationRealized(ticker);
