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

// Build-phase smoke set per CREDIT_BUDGET memory: do NOT fan out to all 8
// sectors during MS-3. Full fan-out is reserved for MS-4b.
const SECTORS_BUILD_PHASE = ["Technology", "Energy"];

const AGENTS = [
  // M1 must run BEFORE M2 — the thesis consumes the news_drift verdict.
  {
    name:    "macro-news-drift",
    binding: "MACRO_NEWS_DRIFT",
    shouldFire: shouldFireMacroNewsDrift,
  },
  {
    name:    "macro-thesis",
    binding: "MACRO_THESIS",
    shouldFire: shouldFireMacroThesis,
  },
  {
    name:    "macro-notes",
    binding: "MACRO_NOTES",
    shouldFire: shouldFireMacroNotes,
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
  // ----- Sector-scoped agents (MS-3c). One AGENTS entry per sector to
  // ----- keep orchestrate() loop logic simple — the gate per entry
  // ----- still queries SECTOR_TREND_long / SECTOR_FACTORS_daily for that
  // ----- specific sector and the fetch carries ?sector=X.
  // S1 must run BEFORE S2 — sector thesis consumes the sector drift verdict.
  ...SECTORS_BUILD_PHASE.map(sector => ({
    name:     `sector-news-drift:${sector}`,
    binding:  "SECTOR_NEWS_DRIFT",
    sector,
    shouldFire: (db) => shouldFireSectorNewsDrift(db, sector),
  })),
  ...SECTORS_BUILD_PHASE.map(sector => ({
    name:     `sector-thesis:${sector}`,
    binding:  "SECTOR_THESIS",
    sector,
    shouldFire: (db) => shouldFireSectorThesis(db, sector),
  })),
  ...SECTORS_BUILD_PHASE.map(sector => ({
    name:     `sector-implementation:${sector}`,
    binding:  "SECTOR_IMPLEMENTATION",
    sector,
    shouldFire: (db) => shouldFireSectorImplementation(db, sector),
  })),
  ...SECTORS_BUILD_PHASE.map(sector => ({
    name:     `sector-hedges:${sector}`,
    binding:  "SECTOR_HEDGES",
    sector,
    shouldFire: (db) => shouldFireSectorHedges(db, sector),
  })),
  ...SECTORS_BUILD_PHASE.map(sector => ({
    name:     `sector-read:${sector}`,
    binding:  "SECTOR_READ",
    sector,
    shouldFire: (db) => shouldFireSectorRead(db, sector),
  })),
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

    // Build the downstream URL. Sector-scoped agents take ?sector=X; force=1
    // is appended as a second param when the user explicitly requested it.
    const params = [];
    if (agent.sector) params.push(`sector=${encodeURIComponent(agent.sector)}`);
    if (force)        params.push("force=1");
    const path = `/build${params.length ? "?" + params.join("&") : ""}`;
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

// M1 epsilon: re-fire if no prior drift, the macro thesis was rewritten
// (driver/tripwire targets changed), or any TOPIC_FEED row scoped to macro:%
// has a date_last_seen newer than the last drift write. Otherwise skip — the
// LLM has nothing new to chew on.
async function shouldFireMacroNewsDrift(db) {
  const row = await db.prepare(
    `SELECT thesis_updated_at, news_drift_updated_at
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at) return { fire: false, reason: "no thesis_json yet (M2 must fire first)" };
  if (!row.news_drift_updated_at) return { fire: true, reason: "first run (no prior news_drift)" };

  if (row.thesis_updated_at > row.news_drift_updated_at) {
    return { fire: true, reason: `thesis newer than news_drift (drivers/tripwires changed)` };
  }

  const since = row.news_drift_updated_at.slice(0, 10);
  const fresh = await db.prepare(
    `SELECT topic_canonical, date_last_seen
       FROM TOPIC_FEED
      WHERE scope LIKE 'macro:%'
        AND date_last_seen > ?
      ORDER BY date_last_seen DESC LIMIT 1`,
  ).bind(since).first();
  if (fresh) {
    return { fire: true, reason: `new macro topic '${fresh.topic_canonical}' on ${fresh.date_last_seen}` };
  }
  return { fire: false, reason: "no new macro topics since last drift" };
}

// M3 epsilon: re-fire if no prior notes, the macro thesis was rewritten
// (driver/tripwire targets changed), drift verdict flipped, or new
// TOPIC_FEED rows scoped to macro:% have arrived since the last write.
async function shouldFireMacroNotes(db) {
  const row = await db.prepare(
    `SELECT thesis_updated_at, news_drift_updated_at, notes_updated_at
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!row) return { fire: false, reason: "no BETA_10_Daily_macro row yet" };
  if (!row.thesis_updated_at) return { fire: false, reason: "no thesis_json yet (M2 must fire first)" };
  if (!row.notes_updated_at) return { fire: true, reason: "first run (no prior notes)" };

  if (row.thesis_updated_at > row.notes_updated_at) {
    return { fire: true, reason: "thesis newer than notes" };
  }
  if (row.news_drift_updated_at && row.news_drift_updated_at > row.notes_updated_at) {
    return { fire: true, reason: "news_drift newer than notes" };
  }

  const since = row.notes_updated_at.slice(0, 10);
  const fresh = await db.prepare(
    `SELECT topic_canonical, date_last_seen
       FROM TOPIC_FEED
      WHERE scope LIKE 'macro:%'
        AND date_last_seen > ?
      ORDER BY date_last_seen DESC LIMIT 1`,
  ).bind(since).first();
  if (fresh) {
    return { fire: true, reason: `new macro topic '${fresh.topic_canonical}' on ${fresh.date_last_seen}` };
  }
  return { fire: false, reason: "no new macro topics or upstream rewrites since last notes" };
}

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

  // M1 News drift verdict change since last thesis write (MS-3e).
  let driftAtLastWrite = null;
  try { driftAtLastWrite = JSON.parse(row.thesis_json || "{}")?.drift_verdict_at_write ?? null; } catch {}
  const drift = await db.prepare(
    `SELECT news_drift_json FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  let currentDriftVerdict = null;
  try { currentDriftVerdict = JSON.parse(drift?.news_drift_json || "{}")?.verdict ?? null; } catch {}
  if (currentDriftVerdict && currentDriftVerdict !== driftAtLastWrite) {
    return { fire: true, reason: `news drift: ${driftAtLastWrite || "(none)"} → ${currentDriftVerdict}` };
  }

  return { fire: false, reason: "regime intact, drift unchanged, no |z|>1.5 fresh prints" };
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

// S1 Sector News drift epsilon (per sector): re-fire if no prior drift, the
// sector thesis was rewritten (driver/tripwire targets changed), or new
// TOPIC_FEED rows scoped to this sector have arrived since the last write.
async function shouldFireSectorNewsDrift(db, sector) {
  const sectorRow = await db.prepare(
    `SELECT thesis_updated_at, news_drift_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) return { fire: false, reason: `no SECTOR_TREND_long row for ${sector}` };
  if (!sectorRow.thesis_updated_at) return { fire: false, reason: `no sector thesis yet for ${sector} (S2 must fire first)` };
  if (!sectorRow.news_drift_updated_at) return { fire: true, reason: `first run for ${sector}` };

  if (sectorRow.thesis_updated_at > sectorRow.news_drift_updated_at) {
    return { fire: true, reason: "sector thesis newer than news_drift" };
  }

  // Reuse the synonym-aware scope set so we catch ConsumerDiscretionary etc.
  const scopes = SECTOR_TOPIC_SCOPES_GATE[sector] || [`sector:${sector}`];
  const since = sectorRow.news_drift_updated_at.slice(0, 10);
  const placeholders = scopes.map(() => "?").join(",");
  const fresh = await db.prepare(
    `SELECT topic_canonical, date_last_seen
       FROM TOPIC_FEED
      WHERE scope IN (${placeholders})
        AND date_last_seen > ?
      ORDER BY date_last_seen DESC LIMIT 1`,
  ).bind(...scopes, since).first();
  if (fresh) {
    return { fire: true, reason: `new ${sector} topic '${fresh.topic_canonical}' on ${fresh.date_last_seen}` };
  }
  return { fire: false, reason: `no new ${sector} topics since last drift` };
}

// Mirror of SECTOR_TOPIC_SCOPES inside macro-sector-news-drift-agent.
// Duplicated here to keep the orchestrator dependency-free.
const SECTOR_TOPIC_SCOPES_GATE = {
  Technology:    ["sector:Technology"],
  ConsDisc:      ["sector:ConsDisc", "sector:ConsumerDiscretionary"],
  Communication: ["sector:Communication"],
  Finance:       ["sector:Finance", "sector:Financials"],
  Energy:        ["sector:Energy"],
  Healthcare:    ["sector:Healthcare"],
  Staples:       ["sector:Staples", "sector:ConsumerStaples"],
  Industrial:    ["sector:Industrial", "sector:Industrials"],
};

// S2 Sector Thesis epsilon (per sector): re-fire if the sector's row has no
// thesis yet, the macro thesis was rewritten more recently, the macro regime
// label changed, the sector's latest SECTOR_FACTORS_daily landed since the
// last sector thesis write, or the sector news_drift verdict flipped.
async function shouldFireSectorThesis(db, sector) {
  const [sectorRow, macroRow, latestFactors] = await Promise.all([
    db.prepare(`SELECT thesis_json, thesis_updated_at, news_drift_json FROM SECTOR_TREND_long WHERE sector = ?`).bind(sector).first(),
    db.prepare(`SELECT regime, thesis_updated_at FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    db.prepare(`SELECT date FROM SECTOR_FACTORS_daily WHERE sector = ? ORDER BY date DESC LIMIT 1`).bind(sector).first(),
  ]);
  if (!sectorRow)     return { fire: false, reason: `no SECTOR_TREND_long row for ${sector}` };
  if (!macroRow?.thesis_updated_at) return { fire: false, reason: "no macro thesis yet" };
  if (!sectorRow.thesis_updated_at) return { fire: true, reason: `first run for ${sector}` };

  if (macroRow.thesis_updated_at > sectorRow.thesis_updated_at) {
    return { fire: true, reason: `macro thesis newer than ${sector} sector thesis` };
  }

  let priorRegime = null;
  try { priorRegime = JSON.parse(sectorRow.thesis_json || "{}")?.regime_at_write ?? null; } catch {}
  if (macroRow.regime && priorRegime !== null && macroRow.regime !== priorRegime) {
    return { fire: true, reason: `macro regime: ${priorRegime} → ${macroRow.regime}` };
  }
  if (macroRow.regime && priorRegime === null) {
    return { fire: true, reason: `macro regime now classified: ${macroRow.regime}` };
  }

  if (latestFactors?.date && latestFactors.date > sectorRow.thesis_updated_at.slice(0, 10)) {
    return { fire: true, reason: `new SECTOR_FACTORS_daily row on ${latestFactors.date}` };
  }

  // S1 News drift verdict change since last sector thesis write (MS-3e).
  let driftAtLastWrite = null;
  try { driftAtLastWrite = JSON.parse(sectorRow.thesis_json || "{}")?.drift_verdict_at_write ?? null; } catch {}
  let currentDriftVerdict = null;
  try { currentDriftVerdict = JSON.parse(sectorRow.news_drift_json || "{}")?.verdict ?? null; } catch {}
  if (currentDriftVerdict && currentDriftVerdict !== driftAtLastWrite) {
    return { fire: true, reason: `${sector} news drift: ${driftAtLastWrite || "(none)"} → ${currentDriftVerdict}` };
  }

  return { fire: false, reason: "sector thesis fresh: macro stable, drift unchanged, no new factors row" };
}

// S4 Sector Implementation epsilon (per sector): re-fire when the sector
// thesis was rewritten, when a fresh SECTOR_FACTORS_daily row landed, or
// any in-sector ticker had its TICKER_TREND_long score updated since the
// last implementation write. Does NOT fire on macro alone — sector thesis
// is the load-bearing input.
async function shouldFireSectorImplementation(db, sector) {
  const sectorRow = await db.prepare(
    `SELECT thesis_updated_at, implementation_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) return { fire: false, reason: `no SECTOR_TREND_long row for ${sector}` };
  if (!sectorRow.thesis_updated_at) return { fire: false, reason: `no sector thesis yet for ${sector}` };
  if (!sectorRow.implementation_updated_at) return { fire: true, reason: `first run for ${sector}` };

  if (sectorRow.thesis_updated_at > sectorRow.implementation_updated_at) {
    return { fire: true, reason: `sector thesis newer than implementation` };
  }

  // Note: TICKER_TREND_long doesn't have an explicit updated_at column we
  // can compare easily across sectors. Skipping that gate path for MS-3c —
  // the thesis-newer check above covers the common case (ticker updates
  // typically trigger a sector thesis re-run via SECTOR_FACTORS_daily,
  // which feeds back here). Tightening deferred.

  return { fire: false, reason: `implementation fresh: sector thesis stable for ${sector}` };
}

// S5 Sector Hedges epsilon (per sector): re-fire whenever the sector thesis
// is rewritten (drivers / tripwires changed → hedge logic changes).
async function shouldFireSectorHedges(db, sector) {
  const sectorRow = await db.prepare(
    `SELECT thesis_updated_at, hedges_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!sectorRow) return { fire: false, reason: `no SECTOR_TREND_long row for ${sector}` };
  if (!sectorRow.thesis_updated_at) return { fire: false, reason: `no sector thesis yet for ${sector}` };
  if (!sectorRow.hedges_updated_at) return { fire: true, reason: `first run for ${sector}` };
  if (sectorRow.thesis_updated_at > sectorRow.hedges_updated_at) {
    return { fire: true, reason: "sector thesis newer than hedges" };
  }
  return { fire: false, reason: `hedges fresh: sector thesis stable for ${sector}` };
}

// S6 Sector Read epsilon (per sector): re-fire whenever any of {thesis,
// implementation, hedges}_updated_at is newer than read_updated_at. The
// sector lede stitches the upstream three. Runs LAST in the per-sector
// chain.
async function shouldFireSectorRead(db, sector) {
  const r = await db.prepare(
    `SELECT thesis_updated_at, implementation_updated_at, hedges_updated_at, read_updated_at
       FROM SECTOR_TREND_long WHERE sector = ?`,
  ).bind(sector).first();
  if (!r) return { fire: false, reason: `no SECTOR_TREND_long row for ${sector}` };
  if (!r.thesis_updated_at)         return { fire: false, reason: `no sector thesis yet` };
  if (!r.implementation_updated_at) return { fire: false, reason: `no implementation yet (S4 must fire first)` };
  if (!r.hedges_updated_at)         return { fire: false, reason: `no hedges yet (S5 must fire first)` };
  if (!r.read_updated_at)           return { fire: true, reason: `first run for ${sector}` };
  if (r.thesis_updated_at         > r.read_updated_at) return { fire: true, reason: "sector thesis newer than read" };
  if (r.implementation_updated_at > r.read_updated_at) return { fire: true, reason: "implementation newer than read" };
  if (r.hedges_updated_at         > r.read_updated_at) return { fire: true, reason: "hedges newer than read" };
  return { fire: false, reason: `read fresh: thesis/impl/hedges all stable for ${sector}` };
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
