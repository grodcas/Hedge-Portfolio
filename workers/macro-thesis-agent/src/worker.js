/**
 * MACRO-THESIS-AGENT (M2) — keystone macro narrative.
 *
 * Per [MAP_PIPELINE.md §M2], maintains "the macro story right now and whether
 * it is intact." Re-runs only on signal change. Output is written to
 * BETA_10_Daily_macro.thesis_json (column added in MS-1a / migration 0045).
 *
 * Inputs assembled at /build time:
 *   - Regime label + confidence  (BETA_10_Daily_macro.regime, .confidence)
 *   - Cross-asset state          (latest snapshot per indicator_code in
 *                                 MACRO_STATE_indicators that's a rate / FX /
 *                                 vol / credit / commodity series)
 *   - Macro indicator panel      (latest snapshot per indicator_code that's an
 *                                 economic release: CPI / NFP / ISM / housing,
 *                                 etc., each with current value + delta_1m +
 *                                 z_vs_24m from MS-1b)
 *   - News-drift verdict         HARDCODED "regime intact" for MS-2b — wired
 *                                live in MS-3e once M1 (macro News drift) ships
 *   - Previous thesis            BETA_10_Daily_macro.thesis_json from latest row
 *
 * Output (validated):
 *   {
 *     prose: string,                  // single-paragraph macro story
 *     drivers: [{name, rationale}],   // 3–5 named macro drivers
 *     tripwires: [{id, condition, currently}],  // 3–5 measurable conditions
 *     version: int,                   // monotonic, increments on each rewrite
 *     last_updated: ISO8601
 *   }
 *
 * Persisted alongside output: an input_fingerprint (sha256 of regime + panel
 * snapshot + drift verdict). On the next /build the agent compares the current
 * fingerprint against the stored one — if identical and force=false, it skips
 * the LLM call entirely. This is the "epsilon check via thesis_updated_at"
 * required by MS-2b: prior thesis stands, no new row written.
 *
 * Endpoints:
 *   GET /build           — assemble inputs, fingerprint, fire LLM iff changed.
 *   GET /build?force=1   — bypass the fingerprint check; always re-runs.
 *
 * Cron is wired by the orchestrator in MS-2c (NOT here).
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

// indicator_code → bucket. Used to split MACRO_STATE_indicators into the
// "cross-asset state" snapshot vs the "macro indicator panel" the prompt
// renders separately. Codes match macro-state-fetcher's FRED_SERIES /
// BLS_SERIES tables and yfinance-cross-asset-fetcher's adds.
const CROSS_ASSET_CODES = new Set([
  // rates / curve
  "FEDFUNDS", "FED_TARGET_UPPER", "FED_TARGET_LOWER",
  "DGS2", "DGS10", "REAL_5Y", "BREAKEVEN_5Y", "BREAKEVEN_5Y5Y_FWD",
  // credit
  "OAS_IG", "OAS_HY",
  // fed balance sheet
  "FED_TOTAL_ASSETS", "BANK_RESERVES",
  // FX / commodities
  "DXY_BROAD", "WTI", "GOLD", "EURUSD", "COPPER",
  // vol
  "VIX", "VVIX", "SKEW",
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    try {
      const out = await build(env.DB, apiKey, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(db, apiKey, force) {
  // ---------- Load latest macro row ----------
  const macroRow = await db.prepare(
    `SELECT id, summary, regime, confidence, tripwires_json,
            thesis_json, thesis_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC
      LIMIT 1`,
  ).first();
  if (!macroRow) {
    throw new Error("no BETA_10_Daily_macro row — run macro-intelligence-builder first");
  }

  // ---------- Load latest indicator snapshot per code ----------
  // Latest release per indicator_code with its rolling stats. Limit grouped
  // pull rather than 30+ subqueries.
  const indRes = await db.prepare(
    `SELECT i.indicator_code, i.indicator_name, i.value, i.unit,
            i.delta_1m, i.z_vs_24m, i.release_date, i.source
       FROM MACRO_STATE_indicators i
       INNER JOIN (
         SELECT indicator_code, MAX(release_date) AS d
           FROM MACRO_STATE_indicators
          GROUP BY indicator_code
       ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
      ORDER BY i.indicator_code`,
  ).all();
  const indicators = indRes.results || [];

  const crossAsset = indicators.filter(r => CROSS_ASSET_CODES.has(r.indicator_code));
  const panel      = indicators.filter(r => !CROSS_ASSET_CODES.has(r.indicator_code));

  // ---------- News drift verdict (hardcoded for MS-2b) ----------
  const driftVerdict = "regime intact";

  // ---------- Previous thesis ----------
  let prevThesis = null;
  if (macroRow.thesis_json) {
    try { prevThesis = JSON.parse(macroRow.thesis_json); } catch {}
  }
  const prevVersion = Number.isInteger(prevThesis?.version) ? prevThesis.version : 0;

  // ---------- Epsilon check ----------
  // The fingerprint folds together every input the prompt renders. Same
  // fingerprint AND a previous thesis exists → no-op, prior version stands.
  const fingerprint = await sha256(JSON.stringify({
    regime:     macroRow.regime,
    confidence: macroRow.confidence,
    drift:      driftVerdict,
    cross_asset: crossAsset.map(r => [r.indicator_code, r.value, r.delta_1m, r.z_vs_24m]),
    panel:       panel.map(r => [r.indicator_code, r.value, r.delta_1m, r.z_vs_24m]),
  }));

  if (!force && prevThesis?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      version: prevVersion,
      thesis_updated_at: macroRow.thesis_updated_at,
    };
  }

  // ---------- Build prompt ----------
  const prompt = buildPrompt({
    regime:     macroRow.regime || "unclassified",
    confidence: macroRow.confidence,
    crossAsset,
    panel,
    driftVerdict,
    prevThesis,
  });

  // ---------- Call LLM ----------
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validateThesis(blob);

  // ---------- Stamp + persist ----------
  // `regime_at_write` is here so the orchestrator (MS-2c) can detect a
  // regime label change without re-reading the indicator panel.
  const now = new Date().toISOString();
  const thesis = {
    prose:        blob.prose.trim(),
    drivers:      blob.drivers,
    tripwires:    blob.tripwires,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow.regime ?? null,
  };

  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET thesis_json       = ?,
            thesis_updated_at = ?,
            thesis_model      = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(thesis), now, MODEL, macroRow.id).run();

  return {
    action: "wrote",
    macro_row_id:    macroRow.id,
    version:         thesis.version,
    drivers_count:   thesis.drivers.length,
    tripwires_count: thesis.tripwires.length,
    thesis_updated_at: now,
  };
}

function buildPrompt({ regime, confidence, crossAsset, panel, driftVerdict, prevThesis }) {
  const confPct = Number.isFinite(confidence) ? `${(confidence * 100).toFixed(0)}%` : "?";
  const crossBlock = crossAsset.length
    ? crossAsset.map(fmtIndicatorLine).join("\n")
    : "  (no cross-asset rows in MACRO_STATE_indicators)";
  const panelBlock = panel.length
    ? panel.map(fmtIndicatorLine).join("\n")
    : "  (no macro indicator rows in MACRO_STATE_indicators)";

  const prevBlock = prevThesis
    ? `Version: ${prevThesis.version ?? "?"} (last updated ${prevThesis.last_updated ?? "?"})
Prose: ${prevThesis.prose ?? "(missing)"}
Drivers: ${(prevThesis.drivers || []).map(d => `- ${d.name}: ${d.rationale}`).join("\n         ") || "(none)"}
Tripwires: ${(prevThesis.tripwires || []).map(t => `- [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n          ") || "(none)"}`
    : "(no prior thesis — this is the first version)";

  return `You are a senior macro strategist at a hedge fund. Maintain "the macro story right now and whether it is intact" in a single paragraph plus structured drivers and tripwires.

REGIME (deterministic classifier)
  Label: ${regime}
  Confidence: ${confPct}

CROSS-ASSET STATE (latest snapshot per series — value | 1m delta | Z vs 24m trend)
${crossBlock}

MACRO INDICATOR PANEL (latest release per series — value | 1m delta | Z vs 24m trend)
${panelBlock}

MACRO NEWS DRIFT VERDICT
  ${driftVerdict}

PREVIOUS THESIS (do NOT rewrite if inputs barely moved — drift gradually)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-7 sentences. Reference specific values, not generic descriptions. e.g. 'core CPI cooled to 2.9%, the third miss in four months' or 'claims at 232k still below the 270k tripwire by 38k'>",
  "drivers": [
    {
      "name": "<3-6 word interpretive frame, e.g. 'soft-landing inflation glide', 'Fed pause priced', 'credit not pricing recession'>",
      "rationale": "<one sentence: which indicator(s) anchor this driver, with values>"
    }
  ],
  "tripwires": [
    {
      "id": "<short slug, e.g. 'oas_hy_500', 'curve_uninvert_claims_270'>",
      "condition": "<measurable, e.g. 'HY OAS > 500bps', '10y-2y un-inverts AND claims > 270k', 'DXY > 110'>",
      "currently": "<one short clause: where we are vs the threshold, with the actual number>"
    }
  ]
}

RULES
- 3–5 drivers. 3–5 tripwires. Quality over quantity.
- Drivers are interpretive frames the market is using right now (sell-side / Fed-speak language). Tripwires are MEASURABLE conditions that, if breached, would break the thesis.
- Ground every claim in the indicator values above. If a number isn't in the panel or cross-asset state, do not cite it.
- If the previous thesis still holds (drivers / tripwires unchanged in spirit), keep them — only swap when the data demands. Edit prose to reflect fresh values.
- Prose must take a position. Avoid hedging language ("may", "could go either way", "we'll watch"). Land on whether the regime is intact, weakening, or breaking.`;
}

function fmtIndicatorLine(r) {
  const v = fmtNum(r.value);
  const u = r.unit ? ` ${r.unit}` : "";
  const d = r.delta_1m == null ? "n/a" : `${r.delta_1m >= 0 ? "+" : ""}${fmtNum(r.delta_1m)}`;
  const z = r.z_vs_24m == null ? "n/a" : `${r.z_vs_24m >= 0 ? "+" : ""}${fmtNum(r.z_vs_24m)}σ`;
  return `  ${r.indicator_code.padEnd(20)} ${v}${u}  |  Δ1m ${d}  |  Z ${z}   (${r.release_date})`;
}

function fmtNum(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}

function validateThesis(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid LLM output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 40) {
    throw new Error("invalid LLM output: prose missing or too short");
  }
  if (!Array.isArray(blob.drivers) || blob.drivers.length < 3 || blob.drivers.length > 5) {
    throw new Error(`invalid LLM output: drivers must be 3-5 items, got ${blob.drivers?.length ?? "?"}`);
  }
  for (const d of blob.drivers) {
    if (!d || typeof d.name !== "string" || typeof d.rationale !== "string") {
      throw new Error("invalid LLM output: each driver needs {name, rationale}");
    }
  }
  if (!Array.isArray(blob.tripwires) || blob.tripwires.length < 3 || blob.tripwires.length > 5) {
    throw new Error(`invalid LLM output: tripwires must be 3-5 items, got ${blob.tripwires?.length ?? "?"}`);
  }
  for (const t of blob.tripwires) {
    if (!t || typeof t.id !== "string" || typeof t.condition !== "string" || typeof t.currently !== "string") {
      throw new Error("invalid LLM output: each tripwire needs {id, condition, currently}");
    }
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
