-- Migration 0046: orchestrator firing log.
--
-- agent-orchestrator (MS-2c) records every per-agent decision it makes:
-- "fire" (we called the agent's /build), "skip" (epsilon not crossed —
-- prior version stands), or "error" (the gate threw, or the downstream
-- agent returned non-ok). `reason` carries the human-readable explanation
-- of why; `result_json` holds the agent's response envelope on fire.
--
-- Used by MS-5a's validation walk to verify agents fire on real signal
-- changes and skip when nothing moved. Also a debugging trail when a
-- dashboard panel looks stale — query "what was the last fire/skip for
-- this agent and why".

CREATE TABLE IF NOT EXISTS PROC_02_Firing_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fired_at    TEXT    NOT NULL,
  agent       TEXT    NOT NULL,
  decision    TEXT    NOT NULL,  -- 'fire' | 'skip' | 'error'
  reason      TEXT,
  result_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_firing_log_agent
  ON PROC_02_Firing_log(agent, fired_at);
