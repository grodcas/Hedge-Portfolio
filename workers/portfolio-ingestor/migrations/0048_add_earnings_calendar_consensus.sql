-- Migration 0048: forward-looking earnings calendar.
--
-- Persists the next print and last filed report per ticker. Drives the
-- event-driven gates in `consensus-fetcher` (skip outside the earnings
-- window) and any other caller that wants "is this ticker about to print".
--
-- Source: Finnhub /calendar/earnings (free tier). Refreshed by
-- `earnings-fetcher` once a day; the row is upserted on (ticker).

CREATE TABLE IF NOT EXISTS EARNINGS_CALENDAR_consensus (
  ticker             TEXT PRIMARY KEY,
  next_earnings_date TEXT,           -- next upcoming print (YYYY-MM-DD)
  last_report_date   TEXT,           -- most recent filed earnings (YYYY-MM-DD)
  source             TEXT,           -- 'finnhub' for now
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_earnings_cal_next
  ON EARNINGS_CALENDAR_consensus(next_earnings_date);
