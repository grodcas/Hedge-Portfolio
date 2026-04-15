-- Equal-weight placeholder across the 25 tracked tickers.
-- User edits this table when real positions are ready.
-- Each ticker gets 4% (25 tickers × 4% = 100%).

INSERT OR REPLACE INTO PORTFOLIO_01_Holdings (ticker, shares, avg_cost, weight_pct, notes) VALUES
  ('AAPL',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('MSFT',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('GOOGL', NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('AMZN',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('NVDA',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('META',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('TSLA',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('INTC',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('AMD',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('NFLX',  NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('BRK.B', NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('JPM',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('GS',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('BAC',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('MS',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('XOM',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('CVX',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('UNH',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('LLY',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('JNJ',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('PG',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('KO',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('HD',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('CAT',   NULL, NULL, 4.0, 'bootstrap placeholder — equal weight'),
  ('BA',    NULL, NULL, 4.0, 'bootstrap placeholder — equal weight');
