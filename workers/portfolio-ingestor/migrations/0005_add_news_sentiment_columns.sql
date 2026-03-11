-- Add sentiment and magnitude columns to BETA_01_News
ALTER TABLE BETA_01_News ADD COLUMN sentiment TEXT;
ALTER TABLE BETA_01_News ADD COLUMN magnitude REAL;

-- Add sentiment and magnitude columns to ALPHA_05_Daily_news
ALTER TABLE ALPHA_05_Daily_news ADD COLUMN sentiment TEXT;
ALTER TABLE ALPHA_05_Daily_news ADD COLUMN magnitude REAL;
