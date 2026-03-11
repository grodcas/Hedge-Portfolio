-- Staging table for per-ticker search results (consumed by curator)
CREATE TABLE IF NOT EXISTS PROC_03_News_staging (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, date)
);
