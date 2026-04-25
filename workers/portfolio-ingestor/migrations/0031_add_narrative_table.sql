-- Migration 0031: Central narrative content table (Narrative build Sprint 0)
--
-- Stores every narrative field rendered on the dashboard: regime, sector
-- landscape, individual sectors, stock landscape, individual stocks. One row
-- per (entity, date, field). Designed for the 3-block structure:
--
--   field='current_reading' : deterministic 3-line factual paragraph
--   field='identification'  : JSON with bullets[] { headline, number, event,
--                              interpretation, source } — interpretation is
--                              mandatory, not decorative
--   field='recommendation'  : JSON with stance + signposts[] { trigger,
--                              threshold, dated_event, action }
--   field='lede'            : plain-text 3-4 line summary written by
--                              GPT-4o-mini reading the three blocks above
--
-- Stocks additionally use field='ident_long'/'ident_short'/'rec_long'/'rec_short'
-- to split long-term vs tactical (Sprint 5, per NARRATIVE_BUILD_PLAN.md
-- decision #6).
--
-- Written by narrator workers under workers/narrator/*. Read by the dashboard
-- via dashboard/server.js GET /api/narrative.

CREATE TABLE IF NOT EXISTS NARRATIVE_01_Content (
  id TEXT PRIMARY KEY,             -- hash(entity_type|entity_id|date|field)
  entity_type TEXT NOT NULL,       -- 'regime' | 'sector_landscape' | 'sector' | 'stock_landscape' | 'stock'
  entity_id TEXT,                  -- NULL for regime/landscapes; 'Healthcare' / 'UNH' otherwise
  date TEXT NOT NULL,              -- ISO date this narrative represents
  field TEXT NOT NULL,             -- see header comment
  content_json TEXT NOT NULL,      -- the narrative payload (prose or structured)
  sources_json TEXT,               -- JSON [{table, id}] — citation audit trail
  model TEXT,                      -- 'gpt-5' | 'gpt-4o-mini' | 'deterministic'
  input_hash TEXT,                 -- SHA of input JSON; stability-check key
  created_at TEXT NOT NULL,        -- ISO timestamp row was written
  last_confirmed_at TEXT NOT NULL, -- bumped on stability-hit rebuild
  superseded_by TEXT               -- id of a newer row that replaced this one
);

CREATE INDEX IF NOT EXISTS idx_narrative_entity
  ON NARRATIVE_01_Content(entity_type, entity_id, date);

CREATE INDEX IF NOT EXISTS idx_narrative_field
  ON NARRATIVE_01_Content(field, date);

-- Trigger log — one row per dispatcher fire (Sprint 7).
-- Lives here so the Validation tab can render a unified view without
-- cross-DB joins.
CREATE TABLE IF NOT EXISTS NARRATIVE_02_Triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  source_event TEXT NOT NULL,      -- 'alpha_01_insert' | 'price_move' | '7d_safety' etc.
  source_detail TEXT,              -- free-text: ticker, table id, magnitude
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  narrator_called TEXT NOT NULL,   -- 'regime' | 'sector:Healthcare' | 'stock:UNH'
  succeeded INTEGER NOT NULL,      -- 1 / 0
  stability_skipped INTEGER,       -- 1 if the stability gate short-circuited the LLM call
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_triggers_timestamp
  ON NARRATIVE_02_Triggers(timestamp DESC);
