-- Migration 0039: PEER_SET_config — per-ticker static peer mapping.
--
-- The Name slide-out's 5-row Peer Comps table needs a defined cohort per
-- ticker. scripts/bootstrap-peers.js already produces config/peers-mapping.json
-- via Finnhub /stock/peers + /stock/profile2. This migration creates a typed
-- table to hold the same mapping so dashboard query paths can JOIN against it
-- (instead of reading a local JSON file from a Worker).
--
-- Bootstrap path: after migration ships, run a one-time import from
-- config/peers-mapping.json. Re-run when portfolio composition changes.

CREATE TABLE IF NOT EXISTS PEER_SET_config (
  ticker TEXT PRIMARY KEY,                -- portfolio ticker
  peers_json TEXT NOT NULL,               -- JSON array of 5 peer tickers
  source TEXT NOT NULL DEFAULT 'finnhub', -- 'finnhub' | 'manual'
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
