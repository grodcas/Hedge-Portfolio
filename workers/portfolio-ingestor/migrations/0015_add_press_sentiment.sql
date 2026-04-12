-- Migration 0015: Add sentiment and magnitude to press releases
-- Sentiment is content-based (event type), not tone-based.
-- Magnitude is materiality for shareholders (0.0-1.0).
ALTER TABLE ALPHA_03_Press ADD COLUMN sentiment TEXT;
ALTER TABLE ALPHA_03_Press ADD COLUMN magnitude REAL;
