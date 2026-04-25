-- Sprint 9: monthly sector fact-sheet snapshots from SSGA Select Sector SPDR PDFs.
-- Each ETF publishes a one-page fact sheet with "Price/Earnings Ratio FY1" (forward P/E),
-- dividend yield, and est. 3-5y EPS growth. Scraped monthly by scripts/scrape-ssga-pe.js.
-- Used by sector-factor-builder to compute valuation_sigma (rolling z-score of forward P/E).

CREATE TABLE IF NOT EXISTS SECTOR_VALUATION_monthly (
  id TEXT PRIMARY KEY,             -- shortHash(etf_ticker|date)
  date TEXT NOT NULL,              -- YYYY-MM-DD, the PDF "as of" date
  etf_ticker TEXT NOT NULL,        -- XLK / XLV / XLF / XLE / XLP / XLI / XLY / XLC
  sector_bucket TEXT NOT NULL,     -- Technology / Healthcare / Finance / Energy / Staples / Industrial / ConsDisc / Communication
  forward_pe REAL,
  div_yield REAL,                  -- %
  est_eps_growth_3_5y REAL,        -- %
  raw_pdf_hash TEXT,               -- SHA-256 of PDF bytes (audit trail)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sv_etf_date ON SECTOR_VALUATION_monthly(etf_ticker, date);
