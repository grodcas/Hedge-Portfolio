-- Migration 0034: smart-fetch fundamentals — track AV's last-indexed quarter
-- and the SEC filing date that triggered the refresh. Lets fetch-fundamentals
-- skip tickers whose latest 10-Q has already been ingested, dropping load
-- from 100 calls/day to event-driven (only after SEC says a new 10-Q is out
-- AND AV has indexed it).

ALTER TABLE FUND_01_Fundamentals ADD COLUMN fiscal_period_ending TEXT;
ALTER TABLE FUND_01_Fundamentals ADD COLUMN last_10q_filing_date TEXT;

CREATE INDEX IF NOT EXISTS idx_fund_fiscal_period
  ON FUND_01_Fundamentals(ticker, fiscal_period_ending);
