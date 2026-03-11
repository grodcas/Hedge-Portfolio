-- 5-layer macro news table
CREATE TABLE IF NOT EXISTS BETA_11_Macro_news (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  layer_calendar TEXT,
  layer_geopolitics TEXT,
  layer_regulatory TEXT,
  layer_sectors TEXT,
  layer_wave TEXT,
  summary TEXT,
  overall_sentiment TEXT,
  overall_magnitude REAL,
  sector_sentiments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_macro_news_date ON BETA_11_Macro_news(date);
