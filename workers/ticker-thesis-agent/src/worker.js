/**
 * TICKER-THESIS-AGENT (#7 Thesis — keystone) — per [TICKER_PIPELINE.md §7].
 *
 * "The load-bearing story for this name right now and whether it is intact."
 * Re-runs only on signal change, otherwise the prior version stands.
 *
 * Inputs (per ticker):
 *   - Fundamentals reading verdict + top 3 deltas
 *     (TICKER_TREND_long.fundamentals_json)
 *   - News drift verdict + structured drift signs
 *     (TICKER_TREND_long.news_drift_json)
 *   - Sector + macro context (regime + sector thesis drivers — for framing
 *     only; the ticker drivers are name-specific)
 *   - Previous thesis version (TICKER_TREND_long.thesis_json)
 *
 * Structural-narrative search (Gemini-with-search): NOT YET WIRED. Per the
 * pattern in M2/S2 where M1/S1 were similarly deferred and later filled in,
 * the prompt explicitly notes structural search is missing and instructs the
 * LLM to derive drivers from the readings + sector frame alone for now.
 * Wiring Gemini search is out of scope for MS-3g — tracked for a later MS.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     drivers:   [{name, rationale}],   // 3-5 ticker-specific frames
 *     tripwires: [{id, condition, currently}],  // 3-5 measurable
 *     version, last_updated, input_fingerprint, ticker_at_write,
 *     fundamentals_verdict_at_write, drift_verdict_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{thesis_json,_updated_at,_model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

const SECTOR_MAP = {
  Technology:    ["AAPL", "MSFT", "NVDA", "INTC", "AMD"],
  ConsDisc:      ["AMZN", "TSLA", "HD"],
  Communication: ["GOOGL", "META", "NFLX"],
  Finance:       ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy:        ["XOM", "CVX"],
  Healthcare:    ["UNH", "LLY", "JNJ"],
  Staples:       ["PG", "KO"],
  Industrial:    ["CAT", "BA"],
};
const TICKER_TO_SECTOR = (() => {
  const m = {};
  for (const [sec, tickers] of Object.entries(SECTOR_MAP)) {
    for (const t of tickers) m[t] = sec;
  }
  return m;
})();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const ticker = url.searchParams.get("ticker");
    if (!ticker) return Response.json({ ok: false, error: "ticker query param required" }, { status: 400 });
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    try {
      const out = await build(env.DB, apiKey, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, ticker, force) {
  const sector = TICKER_TO_SECTOR[ticker] || null;

  const [trendRow, macroRow, sectorRow] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, thesis_updated_at,
              fundamentals_json, news_drift_json
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT regime, thesis_json FROM BETA_10_Daily_macro
        WHERE thesis_json IS NOT NULL
        ORDER BY creation_date DESC LIMIT 1`,
    ).first(),
    sector
      ? db.prepare(
          `SELECT thesis_json FROM SECTOR_TREND_long WHERE sector = ?`,
        ).bind(sector).first()
      : Promise.resolve(null),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!trendRow.fundamentals_json) {
    throw new Error(`no fundamentals_json yet for ${ticker} (#2 must fire first)`);
  }
  // news_drift may legitimately be missing on the first DAG pass since #5
  // can write empty when TOPIC_FEED has no ticker rows yet — handle gracefully.

  const fundamentals = safeJson(trendRow.fundamentals_json) || {};
  const drift        = trendRow.news_drift_json ? safeJson(trendRow.news_drift_json) : null;
  const macroThesis  = macroRow?.thesis_json ? safeJson(macroRow.thesis_json) : null;
  const sectorThesis = sectorRow?.thesis_json ? safeJson(sectorRow.thesis_json) : null;

  const prevThesis  = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const prevVersion = Number.isInteger(prevThesis?.version) ? prevThesis.version : 0;

  const fundVerdict  = fundamentals.verdict || "unknown";
  // Drift defaults to "unknown" rather than silently "intact" so the prompt
  // (and downstream consumers) cannot mistake "no upstream signal yet" for
  // "all clear". Prior behavior gave a false-positive green light on first-run
  // tickers where #5 hadn't fired yet.
  const driftVerdict = drift?.verdict || "unknown";

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    fund_verdict:  fundVerdict,
    fund_deltas:   fundamentals.top_3_deltas || null,
    drift_verdict: driftVerdict,
    drift_signs:   drift?.driver_drift   || null,
    tripwires_fired: drift?.tripwires_fired || null,
    macro_regime:  macroRow?.regime  || null,
    sector_drivers: (sectorThesis?.drivers || []).map(d => d.name),
  }));

  if (!force && prevThesis?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      thesis_updated_at: trendRow.thesis_updated_at,
    };
  }

  const prompt = buildPrompt({
    ticker, sector,
    fundamentals, drift, macroRow, macroThesis, sectorThesis,
    prevThesis,
  });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validateThesis(blob);

  const now = new Date().toISOString();
  const thesis = {
    prose:        blob.prose.trim(),
    drivers:      blob.drivers,
    tripwires:    blob.tripwires,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
    fundamentals_verdict_at_write: fundVerdict,
    drift_verdict_at_write: driftVerdict,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET thesis_json       = ?,
            thesis_updated_at = ?,
            thesis_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(thesis), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: thesis.version,
    drivers_count: thesis.drivers.length,
    tripwires_count: thesis.tripwires.length,
    thesis_updated_at: now,
  };
}

function buildPrompt({ ticker, sector, fundamentals, drift, macroRow, macroThesis, sectorThesis, prevThesis }) {
  const fundBlock = `  verdict:      ${fundamentals.verdict || "(unknown)"}
  prose:        ${fundamentals.prose || "(missing)"}
  top_3_deltas: ${(fundamentals.top_3_deltas || []).map(d => `${d.metric} ${d.value} (${d.direction})`).join("; ") || "(none)"}`;

  const driftBlock = drift
    ? `  verdict:        ${drift.verdict}
  driver_drift:   ${JSON.stringify(drift.driver_drift || {})}
  tripwires_fired: ${JSON.stringify(drift.tripwires_fired || [])}
  topic_count:    ${drift.topic_count ?? "?"}`
    : "  (no news_drift run yet — verdict UNKNOWN, do NOT assume intact; flag the absence in prose)";

  const macroBlock = macroThesis?.drivers?.length
    ? macroThesis.drivers.map(d => `  - ${d.name}`).join("\n")
    : "  (no macro thesis)";
  const sectorBlock = sectorThesis?.drivers?.length
    ? sectorThesis.drivers.map(d => `  - ${d.name}`).join("\n")
    : "  (no sector thesis)";

  const prevBlock = prevThesis
    ? `Version: ${prevThesis.version ?? "?"} (last updated ${prevThesis.last_updated ?? "?"})
Prose: ${prevThesis.prose ?? "(missing)"}
Drivers:
${(prevThesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)"}
Tripwires:
${(prevThesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)"}`
    : "(no prior thesis — this is the first version)";

  return `You are a senior equity analyst maintaining the load-bearing thesis for ${ticker} (sector: ${sector || "unknown"}). One paragraph plus 3-5 named drivers and 3-5 measurable tripwires.

NOTE on structural-narrative search: the Gemini-with-search call is NOT YET WIRED. Derive drivers from the FUNDAMENTALS reading + NEWS DRIFT signs + the macro/sector frame for now. Do not invent industry-report citations.

MACRO REGIME
  Label: ${macroRow?.regime || "unclassified"}

MACRO THESIS DRIVERS (top-level frame)
${macroBlock}

${sector || "?"} SECTOR THESIS DRIVERS (sector frame)
${sectorBlock}

FUNDAMENTALS READING (#2 — verdict + the deltas it leaned on)
${fundBlock}

NEWS DRIFT (#5 — verdict + structured signs)
${driftBlock}

PREVIOUS THESIS (drift gradually — only swap drivers when data demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-7 sentences. Reference at least one fundamentals delta with its value AND the drift verdict. State explicitly whether the thesis is intact, weakening, or breaking.>",
  "drivers": [
    {
      "name":      "<3-6 word ticker-specific frame, e.g. 'datacenter capex cycle', 'GLP-1 adoption ramp', 'auto-cycle bottoming'>",
      "rationale": "<one sentence anchored in a fundamentals delta or a sector driver>"
    }
  ],
  "tripwires": [
    {
      "id":              "<short slug, e.g. 'gross_margin_below_70', 'rev_growth_below_30', 'eps_rev_negative_2q'>",
      "condition":       "<measurable, e.g. 'gross margin < 70% for 2 quarters', 'revenue growth < 30% YoY', '2 consecutive negative EPS revisions'>",
      "currently_value": <number — the actual current reading from fundamentals_json deltas, NO units in the value>,
      "threshold_value": <number — the threshold from condition above, same scale as currently_value>,
      "currently_text":  "<one short clause stating direction: 'gross margin 73.4% — above 70% threshold' or 'revenue growth 22% — below 30% threshold'>"
    }
  ]
}

RULES
- 3-5 drivers. 3-5 tripwires. Quality over quantity.
- Drivers must be NAME-SPECIFIC. Not "macro tailwind" — say "datacenter capex cycle" or "auto-replacement cycle bottoming".
- Tripwires MUST be MEASURABLE thresholds with a current reading drawn from the fundamentals_json deltas above.
- currently_value and threshold_value MUST be plain numbers on the SAME SCALE (both in % or both in $ or both as ratios). currently_text MUST use direction words ("above"/"below"/"at"/"exceeded") that match the actual sign of (currently_value − threshold_value).
- If the previous thesis still holds in spirit (same drivers / tripwires), KEEP them — only edit prose to reflect fresh values.
- Prose must take a position. No hedging language. Land on intact / weakening / breaking.
- If fundamentals verdict is "contracting" AND drift verdict is "drifting" or "breaking", the prose MUST land on weakening or breaking.`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateThesis(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!Array.isArray(blob.drivers) || blob.drivers.length < 3 || blob.drivers.length > 5) {
    throw new Error(`invalid drivers: must be 3-5, got ${blob.drivers?.length ?? "?"}`);
  }
  for (const d of blob.drivers) {
    if (!d || typeof d.name !== "string" || typeof d.rationale !== "string") {
      throw new Error("invalid driver: needs {name, rationale}");
    }
  }
  if (!Array.isArray(blob.tripwires) || blob.tripwires.length < 3 || blob.tripwires.length > 5) {
    throw new Error(`invalid tripwires: must be 3-5, got ${blob.tripwires?.length ?? "?"}`);
  }
  for (const t of blob.tripwires) {
    if (!t || typeof t.id !== "string" || typeof t.condition !== "string") {
      throw new Error("invalid tripwire: needs {id, condition, currently_value, threshold_value, currently_text}");
    }
    if (!Number.isFinite(t.currently_value) || !Number.isFinite(t.threshold_value)) {
      throw new Error(`invalid tripwire ${t.id}: currently_value/threshold_value must be finite numbers`);
    }
    if (typeof t.currently_text !== "string" || t.currently_text.length < 5) {
      throw new Error(`invalid tripwire ${t.id}: currently_text missing or too short`);
    }
    // Direction words in currently_text must match the sign of (currently - threshold).
    // Catches the LLM contradicting its own numeric claim.
    const above = /\b(above|exceeded|over|breached|fired|crossed)\b/i.test(t.currently_text);
    const below = /\b(below|under|short of)\b/i.test(t.currently_text);
    const diff  = t.currently_value - t.threshold_value;
    const tol   = Math.abs(t.threshold_value) * 0.005 + 1e-9;   // 0.5% relative tolerance
    if (above && !below && diff < -tol) {
      throw new Error(`tripwire ${t.id}: text says 'above' but currently_value (${t.currently_value}) < threshold_value (${t.threshold_value})`);
    }
    if (below && !above && diff > tol) {
      throw new Error(`tripwire ${t.id}: text says 'below' but currently_value (${t.currently_value}) > threshold_value (${t.threshold_value})`);
    }
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
