// Narrator — Event dispatcher (Sprint 7)
//
// Runs every 15 minutes via cron. Reads rows inserted since the last tick
// across the source tables, maps each row to the entities it should refresh,
// dedupes, and fans out HTTP calls to the narrator workers. Every fan-out
// is logged to NARRATIVE_02_Triggers.
//
// Cost control stacks:
//   1. Dispatcher only fires narrators for entities whose SOURCE data moved.
//   2. Narrator's own stability gate short-circuits to "stable" when the
//      numeric inputs haven't actually drifted past threshold (bumps
//      last_confirmed_at, no LLM calls).
//   3. Lede agent is inline in each narrator — no extra calls.
//
// Routes:
//   GET /tick          — process events since last tick
//   GET /cold-start    — seed all entities once (used on first deploy)
//   GET /safety-sweep  — force rebuild entities untouched in 7d
//   GET /status        — last tick, per-entity freshness, recent trigger log
//
// Cron (wrangler.jsonc): */15 * * * * → scheduled() calls /tick.
//                        0 6 * * *    → scheduled() calls /safety-sweep.

// Service-binding keys (resolved on env at call-time, not baked as URLs —
// that triggers Cloudflare loop detection, error 1042). Each narrator is
// invoked via env.BINDING.fetch(new Request(...)).
const NARRATOR_BINDINGS = {
  regime:            "NARRATOR_REGIME",
  sector_landscape:  "NARRATOR_SECTOR_LANDSCAPE",
  stock_landscape:   "NARRATOR_STOCK_LANDSCAPE",
  sector:            "NARRATOR_SECTOR",
  stock:             "NARRATOR_STOCK",
};

const KNOWN_TICKERS = new Set([
  "AAPL","MSFT","NVDA","INTC","AMD","AMZN","TSLA","HD",
  "GOOGL","META","NFLX","JPM","GS","BAC","MS","BRK.B",
  "XOM","CVX","UNH","LLY","JNJ","PG","KO","CAT","BA",
]);

const KNOWN_SECTORS = new Set([
  "Communication","ConsDisc","Energy","Finance",
  "Healthcare","Industrial","Staples","Technology",
]);

const SAFETY_NET_DAYS = 7;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/tick")         return handle(() => tick({ env }));
    if (url.pathname === "/cold-start")   return handle(() => coldStart({ env }));
    if (url.pathname === "/safety-sweep") return handle(() => safetySweep({ env }));
    if (url.pathname === "/status")       return handle(() => status({ env }));
    return json({ error: "route not found" }, 404);
  },

  // Cloudflare cron → both expressions call scheduled(); we branch on the
  // cron string. The Workers API doesn't allow per-cron handlers.
  async scheduled(controller, env, _ctx) {
    const cron = controller.cron; // e.g. "*/15 * * * *" or "0 6 * * *"
    if (cron === "0 6 * * *") {
      await safetySweep({ env });
    } else {
      await tick({ env });
    }
  },
};

// ---------- /tick ----------
async function tick({ env }) {
  const db = env.DB;
  const started = Date.now();

  // "Last tick" = MAX(timestamp) in NARRATIVE_02_Triggers. If empty (first run),
  // look 24h back so we catch anything landed since yesterday. Subsequent
  // ticks write a heartbeat below, so this branch only hits once.
  const lastRow = await db.prepare(`SELECT MAX(timestamp) AS t FROM NARRATIVE_02_Triggers`).first();
  const since = lastRow?.t || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const triggers = [];

  // 1. ALPHA_01_Reports → stock (10-K / 10-Q / 8-K / Form 4)
  const reports = await db.prepare(`
    SELECT ticker, type, date, created_at FROM ALPHA_01_Reports
      WHERE created_at > datetime(?) AND ticker IS NOT NULL
      ORDER BY created_at ASC
  `).bind(since).all();
  for (const r of reports.results || []) {
    if (!KNOWN_TICKERS.has(r.ticker)) continue;
    triggers.push({
      entity_type: "stock", entity_id: r.ticker,
      source_event: `filing:${r.type || "?"}`,
      source_detail: `${r.ticker} ${r.type} @${r.date}`,
    });
  }

  // 2. ALPHA_03_Press: |magnitude| ≥ 0.5 → stock
  const press = await db.prepare(`
    SELECT ticker, magnitude, sentiment, date, created_at FROM ALPHA_03_Press
      WHERE created_at > datetime(?) AND ticker IS NOT NULL
        AND ABS(COALESCE(magnitude, 0)) >= 0.5
      ORDER BY created_at ASC
  `).bind(since).all();
  for (const r of press.results || []) {
    if (!KNOWN_TICKERS.has(r.ticker)) continue;
    triggers.push({
      entity_type: "stock", entity_id: r.ticker,
      source_event: "press",
      source_detail: `${r.ticker} mag=${r.magnitude} sent=${r.sentiment} @${r.date}`,
    });
  }

  // 3. FUND_02_Earnings: report_date ≤ today → stock + sector_landscape
  const earnings = await db.prepare(`
    SELECT ticker, period, report_date, created_at FROM FUND_02_Earnings
      WHERE created_at > datetime(?) AND report_date <= date('now')
      ORDER BY created_at ASC
  `).bind(since).all();
  let anyEarnings = false;
  for (const r of earnings.results || []) {
    if (!KNOWN_TICKERS.has(r.ticker)) continue;
    anyEarnings = true;
    triggers.push({
      entity_type: "stock", entity_id: r.ticker,
      source_event: "earnings",
      source_detail: `${r.ticker} ${r.period} report_date=${r.report_date}`,
    });
  }
  if (anyEarnings) {
    triggers.push({
      entity_type: "sector_landscape", entity_id: null,
      source_event: "earnings_release",
      source_detail: "earnings window refreshed sector landscape",
    });
  }

  // 4. BETA_12_News_digest: |magnitude| ≥ 0.7 → stock
  const news = await db.prepare(`
    SELECT ticker, magnitude, sentiment, title, date, created_at FROM BETA_12_News_digest
      WHERE created_at > datetime(?) AND ticker IS NOT NULL
        AND ABS(COALESCE(magnitude, 0)) >= 0.7
      ORDER BY created_at ASC
  `).bind(since).all();
  for (const r of news.results || []) {
    if (!KNOWN_TICKERS.has(r.ticker)) continue;
    triggers.push({
      entity_type: "stock", entity_id: r.ticker,
      source_event: "news",
      source_detail: `${r.ticker} mag=${r.magnitude} "${(r.title || "").slice(0, 80)}"`,
    });
  }

  // 5. BETA_10_Daily_macro: new row → regime
  const macro = await db.prepare(`
    SELECT creation_date FROM BETA_10_Daily_macro
      WHERE creation_date > datetime(?) ORDER BY creation_date ASC LIMIT 1
  `).bind(since).first();
  if (macro) {
    triggers.push({
      entity_type: "regime", entity_id: null,
      source_event: "macro_update",
      source_detail: `BETA_10_Daily_macro @${macro.creation_date}`,
    });
  }

  // 6. SECTOR_FACTORS_daily: new date → all sectors + landscape
  // (We don't diff regime_fit here — each sector narrator's stability gate
  //  already enforces the >0.2 drift rule. Fire; narrator skips if stable.)
  const newSectorDate = await db.prepare(`
    SELECT MAX(date) AS d FROM SECTOR_FACTORS_daily WHERE date > DATE(?)
  `).bind(since.slice(0, 10)).first();
  if (newSectorDate?.d) {
    for (const s of KNOWN_SECTORS) {
      triggers.push({
        entity_type: "sector", entity_id: s,
        source_event: "sector_factors_updated",
        source_detail: `SECTOR_FACTORS_daily @${newSectorDate.d}`,
      });
    }
    triggers.push({
      entity_type: "sector_landscape", entity_id: null,
      source_event: "sector_factors_updated",
      source_detail: `SECTOR_FACTORS_daily @${newSectorDate.d}`,
    });
  }

  // 7. SIGNAL_01_Assessment: new date → all stocks + stock_landscape
  const newAssessDate = await db.prepare(`
    SELECT MAX(date) AS d FROM SIGNAL_01_Assessment WHERE date > DATE(?)
  `).bind(since.slice(0, 10)).first();
  if (newAssessDate?.d) {
    for (const t of KNOWN_TICKERS) {
      triggers.push({
        entity_type: "stock", entity_id: t,
        source_event: "assessment_updated",
        source_detail: `SIGNAL_01_Assessment @${newAssessDate.d}`,
      });
    }
    triggers.push({
      entity_type: "stock_landscape", entity_id: null,
      source_event: "assessment_updated",
      source_detail: `SIGNAL_01_Assessment @${newAssessDate.d}`,
    });
  }

  // Dedupe by entity key — keep the FIRST source_event recorded for each
  // entity so the trigger log shows the originating cause.
  const byKey = new Map();
  for (const t of triggers) {
    const key = `${t.entity_type}|${t.entity_id ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, t);
  }

  const entries = [...byKey.values()];
  const results = await fanOut({ env, db, entries, batch: 3, force: false });

  // Heartbeat: every tick leaves a marker row so the next tick's "since"
  // advances even when no events were detected.
  await logTrigger(db, {
    entity_type: "_dispatcher",
    entity_id: null,
    source_event: "tick_heartbeat",
    source_detail: `since=${since} detected=${triggers.length} unique=${entries.length}`,
    narrator_called: null,
    succeeded: true,
    stability_skipped: false,
    error: null,
    duration_ms: Date.now() - started,
  });

  return {
    ok: true,
    since,
    events_detected: triggers.length,
    unique_entities: entries.length,
    fired:          results.filter((r) => r.succeeded && !r.stability_skipped).length,
    skipped_stable: results.filter((r) => r.stability_skipped).length,
    failed:         results.filter((r) => !r.succeeded).length,
    duration_ms: Date.now() - started,
    results,
  };
}

// ---------- /safety-sweep ----------
async function safetySweep({ env }) {
  const db = env.DB;
  const started = Date.now();
  const cutoff = new Date(Date.now() - SAFETY_NET_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const res = await db.prepare(`
    SELECT entity_type, entity_id, MAX(last_confirmed_at) AS last_conf
      FROM NARRATIVE_01_Content
      WHERE superseded_by IS NULL
        AND field IN ('identification','ident_long','lede')
      GROUP BY entity_type, entity_id
  `).all();

  const stale = (res.results || []).filter((r) => !r.last_conf || r.last_conf < cutoff);
  const entries = stale.map((r) => ({
    entity_type:  r.entity_type,
    entity_id:    r.entity_id,
    source_event: "safety_net",
    source_detail: `last_confirmed_at=${r.last_conf || "never"} < ${cutoff}`,
  }));
  const results = await fanOut({ env, db, entries, batch: 3, force: true });

  return {
    ok: true, cutoff,
    stale_entities: entries.length,
    fired:  results.filter((r) => r.succeeded).length,
    failed: results.filter((r) => !r.succeeded).length,
    duration_ms: Date.now() - started,
  };
}

// ---------- /cold-start ----------
async function coldStart({ env }) {
  const db = env.DB;
  const started = Date.now();
  const entries = [
    { entity_type: "regime",           entity_id: null, source_event: "cold_start", source_detail: "seed regime" },
    { entity_type: "sector_landscape", entity_id: null, source_event: "cold_start", source_detail: "seed sector_landscape" },
    { entity_type: "stock_landscape",  entity_id: null, source_event: "cold_start", source_detail: "seed stock_landscape" },
    ...[...KNOWN_SECTORS].map((s) => ({ entity_type: "sector", entity_id: s, source_event: "cold_start", source_detail: `seed sector ${s}` })),
    ...[...KNOWN_TICKERS].map((t) => ({ entity_type: "stock",  entity_id: t, source_event: "cold_start", source_detail: `seed stock ${t}` })),
  ];
  const results = await fanOut({ env, db, entries, batch: 3, force: true });
  return {
    ok: true,
    seeded: results.filter((r) => r.succeeded).length,
    failed: results.filter((r) => !r.succeeded).length,
    duration_ms: Date.now() - started,
  };
}

// ---------- /status ----------
async function status({ env }) {
  const db = env.DB;
  const [lastTick, entityFreshness, recent, costToday] = await Promise.all([
    db.prepare(`SELECT MAX(timestamp) AS t FROM NARRATIVE_02_Triggers`).first(),
    db.prepare(`
      SELECT entity_type, entity_id, MAX(last_confirmed_at) AS last_confirmed_at
        FROM NARRATIVE_01_Content
        WHERE superseded_by IS NULL
          AND field IN ('identification','ident_long','lede')
        GROUP BY entity_type, entity_id
        ORDER BY entity_type, entity_id
    `).all(),
    db.prepare(`
      SELECT timestamp, source_event, entity_type, entity_id,
             succeeded, stability_skipped, duration_ms, error
        FROM NARRATIVE_02_Triggers
        WHERE entity_type <> '_dispatcher'
        ORDER BY timestamp DESC LIMIT 30
    `).all(),
    // Exclude internal heartbeat rows (_dispatcher) from the cost window —
    // those are bookkeeping, not narrator fires.
    db.prepare(`
      SELECT COUNT(*) AS fires,
             SUM(CASE WHEN succeeded=1 AND stability_skipped=0 THEN 1 ELSE 0 END) AS llm_fires,
             SUM(CASE WHEN stability_skipped=1 THEN 1 ELSE 0 END) AS stable_skips,
             SUM(CASE WHEN succeeded=0 THEN 1 ELSE 0 END) AS failures
        FROM NARRATIVE_02_Triggers
        WHERE timestamp >= datetime('now', '-24 hours')
          AND entity_type <> '_dispatcher'
    `).first(),
  ]);
  return {
    ok: true,
    last_tick: lastTick?.t || null,
    cost_window_24h: costToday || null,
    entity_freshness: entityFreshness.results || [],
    recent_fires: recent.results || [],
  };
}

// ---------- helpers ----------

// Build the per-narrator path string (after "https://host/"). Used both for
// the service-binding fetch URL (host part is placeholder) and for logging.
function narratorPathFor({ entity_type, entity_id, force }) {
  const forceQ = force ? "force=1" : "";
  switch (entity_type) {
    case "regime":
    case "sector_landscape":
    case "stock_landscape":
      return force ? `/build?force=1` : `/build`;
    case "sector":
      return `/build?sector=${encodeURIComponent(entity_id)}${forceQ ? "&" + forceQ : ""}`;
    case "stock":
      return `/build?ticker=${encodeURIComponent(entity_id)}${forceQ ? "&" + forceQ : ""}`;
    default: return null;
  }
}

function narratorBindingFor(entity_type) {
  return NARRATOR_BINDINGS[entity_type] || null;
}

async function fanOut({ env, db, entries, batch = 3, force = false }) {
  const out = [];
  for (let i = 0; i < entries.length; i += batch) {
    const slice = entries.slice(i, i + batch);
    const batchResults = await Promise.all(slice.map((e) => fireOne({ env, db, entry: e, force })));
    out.push(...batchResults);
  }
  return out;
}

async function fireOne({ env, db, entry, force }) {
  const bindingKey = narratorBindingFor(entry.entity_type);
  const path = narratorPathFor({ entity_type: entry.entity_type, entity_id: entry.entity_id, force });
  const narrator_called = `${entry.entity_type}${path || ""}`; // for logging

  if (!bindingKey || !path || !env[bindingKey]) {
    await logTrigger(db, {
      ...entry, narrator_called, succeeded: false, stability_skipped: false,
      error: `no narrator binding for ${entry.entity_type}`, duration_ms: 0,
    });
    return { ...entry, narrator_called, succeeded: false, error: "no_narrator" };
  }

  const started = Date.now();
  try {
    // Service-binding fetch: the host in the URL is ignored; Cloudflare
    // routes the request directly to the bound service.
    const req = new Request(`https://narrator.internal${path}`);
    const res = await env[bindingKey].fetch(req);
    const body = await res.json();
    const duration_ms = Date.now() - started;
    const succeeded = Boolean(body?.ok);
    const stability_skipped = Boolean(body?.stable);
    await logTrigger(db, {
      ...entry, narrator_called, succeeded, stability_skipped,
      error: succeeded ? null : (body?.error || "unknown"), duration_ms,
    });
    return { ...entry, narrator_called, succeeded, stability_skipped, duration_ms };
  } catch (e) {
    const duration_ms = Date.now() - started;
    await logTrigger(db, {
      ...entry, narrator_called, succeeded: false, stability_skipped: false,
      error: e.message || String(e), duration_ms,
    });
    return { ...entry, narrator_called, succeeded: false, error: e.message || String(e) };
  }
}

async function logTrigger(db, row) {
  // id INTEGER PRIMARY KEY AUTOINCREMENT — omit; SQLite assigns.
  // narrator_called is NOT NULL per schema; use "(heartbeat)" when a tick
  // itself is being logged (no narrator fired).
  const ts = new Date().toISOString();
  await db.prepare(`
    INSERT INTO NARRATIVE_02_Triggers
      (timestamp, source_event, source_detail, entity_type, entity_id,
       narrator_called, succeeded, stability_skipped, duration_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    ts,
    row.source_event, row.source_detail || null,
    row.entity_type, row.entity_id ?? null,
    row.narrator_called ?? "(heartbeat)",
    row.succeeded ? 1 : 0,
    row.stability_skipped ? 1 : 0,
    row.duration_ms ?? null,
    row.error ?? null,
  ).run();
}

async function handle(fn) {
  try { return json(await fn()); }
  catch (e) {
    console.error("[narrator-dispatcher] error:", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "content-type": "application/json" },
  });
}
