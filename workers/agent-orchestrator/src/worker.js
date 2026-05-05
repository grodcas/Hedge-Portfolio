/**
 * AGENT-ORCHESTRATOR — per-agent epsilon gate + firing log.
 *
 * For each registered agent:
 *   1. Run its `shouldFire(db)` gate against current D1 state.
 *   2. If fire → call the agent's worker via service binding, wait for the
 *      response, log the result.
 *   3. If skip → log the skip reason; the agent's prior version stands.
 *
 * Every decision is appended to PROC_02_Firing_log so MS-5a's validation
 * walk can trace why a panel updated (or didn't).
 *
 * Per-agent epsilons (only M2 lives here today; the rollout MSes add the
 * rest):
 *
 *   M2 (macro-thesis):
 *     - first run (no prior thesis_updated_at)               → fire
 *     - regime label changed since last write                → fire
 *     - any panel indicator |z_vs_24m| > 1.5 with release_date
 *       at-or-after last thesis_updated_at                   → fire
 *     - tripwire flag fired (M1, lands in MS-3e)             → fire (deferred)
 *     - else                                                  → skip
 *
 * Endpoints:
 *   GET /run                          — walk every agent.
 *   GET /run?agent=macro-thesis       — only that one.
 *   GET /run?force=1                  — bypass gates; fire every agent
 *                                       with ?force=1 propagated downstream.
 *
 * Cron: hourly Mon–Fri 14:00–22:00 UTC (US market hours).
 */

const AGENTS = [
  {
    name:    "macro-thesis",
    binding: "MACRO_THESIS",
    shouldFire: shouldFireMacroThesis,
  },
  {
    name:    "macro-positioning",
    binding: "MACRO_POSITIONING",
    shouldFire: shouldFireMacroPositioning,
  },
  {
    name:    "macro-signposts",
    binding: "MACRO_SIGNPOSTS",
    shouldFire: shouldFireMacroSignposts,
  },
  {
    name:    "macro-read",
    binding: "MACRO_READ",
    shouldFire: shouldFireMacroRead,
  },
  {
    name:    "macro-fomc-summary",
    binding: "MACRO_FOMC_SUMMARY",
    shouldFire: shouldFireMacroFomcSummary,
  },
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/run") return new Response("Not found", { status: 404 });

    const force      = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    const onlyAgent  = url.searchParams.get("agent");

    try {
      const out = await orchestrate(env, { force, onlyAgent });
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      orchestrate(env, { force: false, onlyAgent: null })
        .catch((e) => console.error(`[orchestrator] cron: ${e.message}`)),
    );
  },
};

async function orchestrate(env, { force, onlyAgent }) {
  const results = [];

  for (const agent of AGENTS) {
    if (onlyAgent && agent.name !== onlyAgent) continue;

    let gate;
    try {
      gate = force
        ? { fire: true, reason: "force=1 (orchestrator override)" }
        : await agent.shouldFire(env.DB);
    } catch (err) {
      await logDecision(env.DB, agent.name, "error", `gate threw: ${err.message}`, null);
      results.push({ agent: agent.name, decision: "error", error: err.message });
      continue;
    }

    if (!gate.fire) {
      await logDecision(env.DB, agent.name, "skip", gate.reason, null);
      results.push({ agent: agent.name, decision: "skip", reason: gate.reason });
      continue;
    }

    // Fire via service binding. Workers reach each other internally — no
    // workers.dev URL needed, no extra HTTP roundtrip cost.
    const target = env[agent.binding];
    if (!target) {
      const msg = `service binding ${agent.binding} not found in env`;
      await logDecision(env.DB, agent.name, "error", msg, null);
      results.push({ agent: agent.name, decision: "error", error: msg });
      continue;
    }

    const path = force ? "/build?force=1" : "/build";
    let body, decision;
    try {
      const res  = await target.fetch(new Request(`https://internal${path}`));
      body = await res.json();
      const okPayload = res.ok && body && body.ok !== false;
      decision = okPayload ? "fire" : "error";
    } catch (err) {
      decision = "error";
      body = { error: err.message };
    }

    await logDecision(env.DB, agent.name, decision, gate.reason, JSON.stringify(body));
    results.push({ agent: agent.name, decision, reason: gate.reason, result: body });
  }

  return { results };
}

// ---------------------------------------------------------------------------
// Per-agent gates
// ---------------------------------------------------------------------------

async function shouldFireMacroThesis(db) {
  const row = await db.prepare(
    `SELECT regime, thesis_updated_at, thesis_json
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC
      LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at) return { fire: true, reason: "first run (no prior thesis)" };

  // regime label change vs the regime as-of the last write
  let priorRegime = null;
  try { priorRegime = JSON.parse(row.thesis_json || "{}")?.regime_at_write ?? null; } catch {}
  if (row.regime && priorRegime !== null && row.regime !== priorRegime) {
    return { fire: true, reason: `regime: ${priorRegime} → ${row.regime}` };
  }
  // Edge case: thesis was written when regime was still NULL; now regime
  // exists. Treat as a change to fire once and capture the regime label.
  if (row.regime && priorRegime === null) {
    return { fire: true, reason: `regime now classified: ${row.regime} (was null at last write)` };
  }

  // Fresh hot print since last thesis (|z|>1.5).
  // Date-only comparison is fine: thesis_updated_at is ISO and so are
  // release_date columns (YYYY-MM-DD prefix matches).
  const since = row.thesis_updated_at.slice(0, 10);
  const hot = await db.prepare(
    `SELECT indicator_code, value, z_vs_24m, release_date
       FROM MACRO_STATE_indicators
      WHERE release_date >= ?
        AND z_vs_24m IS NOT NULL
        AND ABS(z_vs_24m) > 1.5
      ORDER BY release_date DESC, ABS(z_vs_24m) DESC
      LIMIT 1`,
  ).bind(since).first();
  if (hot) {
    return {
      fire: true,
      reason: `${hot.indicator_code} z=${Number(hot.z_vs_24m).toFixed(2)} on ${hot.release_date}`,
    };
  }

  // M1 tripwire flag — wired in MS-3e once macro News drift exists.

  return { fire: false, reason: "regime intact, no |z|>1.5 fresh prints since last write" };
}

// M4 Positioning epsilon: re-fire if thesis was rewritten, regime flipped,
// or a panel indicator >|1.5σ| has landed since last positioning write.
async function shouldFireMacroPositioning(db) {
  const row = await db.prepare(
    `SELECT regime, thesis_updated_at, positioning_updated_at, positioning_json
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at) return { fire: false, reason: "no thesis_json yet (M2 must fire first)" };
  if (!row.positioning_updated_at) return { fire: true, reason: "first run (no prior positioning)" };

  if (row.thesis_updated_at > row.positioning_updated_at) {
    return { fire: true, reason: `thesis newer than positioning (${row.thesis_updated_at} > ${row.positioning_updated_at})` };
  }

  let priorRegime = null;
  try { priorRegime = JSON.parse(row.positioning_json || "{}")?.regime_at_write ?? null; } catch {}
  if (row.regime && priorRegime !== null && row.regime !== priorRegime) {
    return { fire: true, reason: `regime: ${priorRegime} → ${row.regime}` };
  }
  if (row.regime && priorRegime === null) {
    return { fire: true, reason: `regime now classified: ${row.regime}` };
  }

  const since = row.positioning_updated_at.slice(0, 10);
  const hot = await db.prepare(
    `SELECT indicator_code, z_vs_24m, release_date
       FROM MACRO_STATE_indicators
      WHERE release_date >= ?
        AND z_vs_24m IS NOT NULL
        AND ABS(z_vs_24m) > 1.5
      ORDER BY release_date DESC LIMIT 1`,
  ).bind(since).first();
  if (hot) {
    return {
      fire: true,
      reason: `${hot.indicator_code} z=${Number(hot.z_vs_24m).toFixed(2)} on ${hot.release_date}`,
    };
  }

  return { fire: false, reason: "thesis stable, regime intact, no |z|>1.5 fresh prints" };
}

// M5 Signposts epsilon: re-fire when thesis re-runs (drivers/tripwires changed
// → relevance filter changes) or a new high-impact calendar event lands inside
// the 21-day horizon since last write.
async function shouldFireMacroSignposts(db) {
  const row = await db.prepare(
    `SELECT thesis_updated_at, signposts_updated_at
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at) return { fire: false, reason: "no thesis_json yet (M2 must fire first)" };
  if (!row.signposts_updated_at) return { fire: true, reason: "first run (no prior signposts)" };

  if (row.thesis_updated_at > row.signposts_updated_at) {
    return { fire: true, reason: `thesis newer than signposts (${row.thesis_updated_at} > ${row.signposts_updated_at})` };
  }

  const since = row.signposts_updated_at.slice(0, 10);
  const fresh = await db.prepare(
    `SELECT event_date, event_code, country
       FROM MACRO_STATE_calendar
      WHERE created_at >= ?
        AND event_date >= date('now')
        AND event_date <= date('now', '+21 days')
        AND impact = 'high'
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(since + "T00:00:00Z").first();
  if (fresh) {
    return { fire: true, reason: `new ${fresh.country}/${fresh.event_code} on ${fresh.event_date} added since last write` };
  }

  return { fire: false, reason: "thesis stable, no new high-impact calendar events in horizon" };
}

// M6 Read epsilon: re-fire whenever any of {thesis, positioning, signposts}
// has been rewritten more recently than read. M6 is the slide-out lede — its
// only job is to stitch the upstream three. Runs LAST in the orchestrator.
async function shouldFireMacroRead(db) {
  const row = await db.prepare(
    `SELECT thesis_updated_at, positioning_updated_at, signposts_updated_at, read_updated_at
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at)      return { fire: false, reason: "no thesis_json yet" };
  if (!row.positioning_updated_at) return { fire: false, reason: "no positioning_json yet (M4 must fire first)" };
  if (!row.signposts_updated_at)   return { fire: false, reason: "no signposts_json yet (M5 must fire first)" };
  if (!row.read_updated_at)        return { fire: true, reason: "first run (no prior read)" };

  if (row.thesis_updated_at      > row.read_updated_at) return { fire: true, reason: "thesis newer than read" };
  if (row.positioning_updated_at > row.read_updated_at) return { fire: true, reason: "positioning newer than read" };
  if (row.signposts_updated_at   > row.read_updated_at) return { fire: true, reason: "signposts newer than read" };

  return { fire: false, reason: "thesis/positioning/signposts all stable since last read" };
}

// M7 FOMC summary epsilon: cached until the NEXT meeting parse. Fire iff
// MACRO_STATE_fomc has a meeting_date newer than what's stashed inside the
// existing fomc_summary_json (or no summary exists).  Independent of the
// per-refresh agents per [MAP_PIPELINE.md §M7].
async function shouldFireMacroFomcSummary(db) {
  const row = await db.prepare(
    `SELECT fomc_summary_json, fomc_summary_updated_at
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };

  const latestFomc = await db.prepare(
    `SELECT meeting_date FROM MACRO_STATE_fomc ORDER BY meeting_date DESC LIMIT 1`,
  ).first();
  if (!latestFomc) return { fire: false, reason: "no MACRO_STATE_fomc rows yet" };

  if (!row.fomc_summary_json) {
    return { fire: true, reason: `first run (no prior fomc_summary; latest meeting ${latestFomc.meeting_date})` };
  }
  let storedMeeting = null;
  try { storedMeeting = JSON.parse(row.fomc_summary_json)?.fomc_meeting_date_at_write ?? null; } catch {}
  if (storedMeeting !== latestFomc.meeting_date) {
    return { fire: true, reason: `new FOMC meeting ${latestFomc.meeting_date} (was ${storedMeeting})` };
  }
  return { fire: false, reason: `cached for meeting ${storedMeeting}` };
}

// ---------------------------------------------------------------------------
// Firing log
// ---------------------------------------------------------------------------

async function logDecision(db, agent, decision, reason, resultJson) {
  await db.prepare(
    `INSERT INTO PROC_02_Firing_log (fired_at, agent, decision, reason, result_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(new Date().toISOString(), agent, decision, reason ?? null, resultJson ?? null).run();
}
