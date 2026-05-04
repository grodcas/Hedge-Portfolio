-- Migration 0038: TICKER_TREND_long.tripwires_json.
--
-- Per-ticker thesis tripwires (e.g. "DC rev growth < 30% q/q", "Inventory >
-- 120 days") aren't structured today — they live inside the narrative blob.
-- The Name slide-out's TRIPWIRES card needs them as a JSON array of
-- {name, threshold, current_value, status: ok|watch|alert} so the dashboard
-- can colour the row.
--
-- ticker-trend-long will start populating this on the next run after the
-- migration. SECTOR_TREND_long parallel column added too — same pattern,
-- same dashboard need (sector slide-out tripwires).

ALTER TABLE TICKER_TREND_long  ADD COLUMN tripwires_json TEXT;
ALTER TABLE SECTOR_TREND_long  ADD COLUMN tripwires_json TEXT;
