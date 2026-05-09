/**
 * MACRO-SECTOR-THESIS-AGENT (S2) — keystone sector narrative.
 *
 * Per [MAP_PIPELINE.md §S2]. "The load-bearing story for this sector right
 * now and whether it is intact." Re-runs only on signal change.
 *
 * Inputs (per sector):
 *   - SECTOR_FACTORS_daily latest snapshot (regime_fit, valuation_sigma,
 *     rs_ratio, rs_momentum, rel_strength_13w, breadth_above_200dma,
 *     earn_momentum, fwd_pe_sector, stance, stance_score)
 *   - Macro regime + macro thesis drivers + macro thesis tripwires
 *     (BETA_10_Daily_macro — context for the sector's regime fit)
 *   - Sector-specific raw releases from MACRO_STATE_indicators (small
 *     hand-picked slice per sector — Energy: WTI / RIG_PROXY; Finance:
 *     curve + credit; Tech: 10y + reals; Industrial: HOUST / INDPRO; etc.).
 *     Each carries current value + delta_1m + z_vs_24m.
 *   - Sector News drift verdict      SECTOR_TREND_long.news_drift_json.verdict
 *                                    (S1 — added in MS-3e). Defaults to
 *                                    "intact" if S1 hasn't fired yet.
 *   - Previous SECTOR_TREND_long.thesis_json
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     drivers:   [{name, rationale}],   // 3-5 sector-specific frames
 *     tripwires: [{id, condition, currently}],  // 3-5 measurable
 *     version, last_updated, input_fingerprint, regime_at_write
 *   }
 *
 * Writes SECTOR_TREND_long.{thesis_json,_updated_at,_model} for the
 * sector row (PRIMARY KEY). Endpoint: GET /build?sector=X[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

// Canonical 8 sectors (matches operations-agent / sector-factor-builder).
const VALID_SECTORS = new Set([
  "Technology", "ConsDisc", "Communication", "Finance",
  "Energy", "Healthcare", "Staples", "Industrial",
]);

// Hand-picked indicator-code slice per sector. Restricts the prompt to the
// raw releases that actually drive that sector's thesis (per [MAP_PIPELINE
// §S2 "sector-specific raw releases"]). Codes match macro-state-fetcher /
// yfinance-cross-asset-fetcher conventions. A code missing from
// MACRO_STATE_indicators is silently skipped.
const SECTOR_INDICATOR_SLICES = {
  Energy:        ["WTI", "RIG_PROXY", "DXY_BROAD", "GOLD"],
  Finance:       ["DGS2", "DGS10", "OAS_IG", "OAS_HY", "FEDFUNDS", "BANK_RESERVES"],
  Technology:    ["DGS10", "REAL_5Y", "BREAKEVEN_5Y", "VIX"],
  Communication: ["DGS10", "REAL_5Y", "DXY_BROAD"],
  ConsDisc:      ["UNEMP", "UMICH_SENT", "INFL_EXP_1Y", "WTI"],
  Healthcare:    ["UNEMP", "UMICH_SENT", "DGS10", "INFL_EXP_1Y"],
  Staples:       ["CPI_HEADLINE", "CPI_CORE", "WTI", "DXY_BROAD"],
  Industrial:    ["INDPRO", "HOUST", "RIG_PROXY", "JOLTS", "WTI"],
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const sector = url.searchParams.get("sector");
    if (!sector || !VALID_SECTORS.has(sector)) {
      return Response.json({ ok: false, error: `invalid sector — use one of: ${[...VALID_SECTORS].join(",")}` }, { status: 400 });
    }
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

    try {
      const out = await build(env, env.DB, apiKey, sector, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, sector, force) {
  // ---------- Sector trend row + macro context ----------
  const [sectorRow, macroRow, sectorFactors] = await Promise.all([
    db.prepare(
      `SELECT sector, regime, score, thesis_json, thesis_updated_at,
              news_drift_json, news_drift_updated_at
         FROM SECTOR_TREND_long WHERE sector = ?`,
    ).bind(sector).first(),
    db.prepare(
      `SELECT regime, thesis_json
         FROM BETA_10_Daily_macro
        WHERE thesis_json IS NOT NULL
        ORDER BY creation_date DESC LIMIT 1`,
    ).first(),
    db.prepare(
      `SELECT sector, date, regime_fit, valuation_sigma, rel_strength_13w,
              rs_ratio, rs_momentum, breadth_above_200dma, earn_momentum,
              fwd_pe_sector, stance, stance_score
         FROM SECTOR_FACTORS_daily
        WHERE sector = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(sector).first(),
  ]);
  if (!sectorRow)     throw new Error(`no SECTOR_TREND_long row for ${sector}`);
  if (!macroRow)      throw new Error("no BETA_10_Daily_macro thesis_json yet");
  if (!sectorFactors) throw new Error(`no SECTOR_FACTORS_daily row for ${sector}`);

  const macroThesis = JSON.parse(macroRow.thesis_json);

  // ---------- Sector-specific indicator slice ----------
  const slice = SECTOR_INDICATOR_SLICES[sector] || [];
  const indRows = slice.length
    ? (await db.prepare(
        `SELECT i.indicator_code, i.indicator_name, i.value, i.unit,
                i.delta_1m, i.z_vs_24m, i.release_date
           FROM MACRO_STATE_indicators i
           INNER JOIN (
             SELECT indicator_code, MAX(release_date) AS d
               FROM MACRO_STATE_indicators
              WHERE indicator_code IN (${slice.map(() => "?").join(",")})
              GROUP BY indicator_code
           ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
          ORDER BY i.indicator_code`,
      ).bind(...slice).all()).results || []
    : [];

  // ---------- News drift verdict (S1, MS-3e). Defaults to "intact" until
  //            S1 has run for the first time on this sector. ----------
  let driftVerdict = "intact";
  let driftStructured = null;
  if (sectorRow.news_drift_json) {
    try {
      driftStructured = JSON.parse(sectorRow.news_drift_json);
      if (driftStructured?.verdict) driftVerdict = driftStructured.verdict;
    } catch {}
  }

  // ---------- Fingerprint + no-op ----------
  const prevThesis = sectorRow.thesis_json ? safeJson(sectorRow.thesis_json) : null;
  const prevVersion = Number.isInteger(prevThesis?.version) ? prevThesis.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    sector,
    macro_regime:    macroRow.regime,
    sector_factors: [
      sectorFactors.regime_fit, sectorFactors.valuation_sigma,
      sectorFactors.rel_strength_13w, sectorFactors.rs_ratio,
      sectorFactors.rs_momentum, sectorFactors.breadth_above_200dma,
      sectorFactors.earn_momentum, sectorFactors.fwd_pe_sector, sectorFactors.stance,
    ],
    indicators: indRows.map(r => [r.indicator_code, r.value, r.delta_1m, r.z_vs_24m]),
    drift: driftVerdict,
    drift_signs:     driftStructured?.driver_drift ?? null,
    tripwires_fired: driftStructured?.tripwires_fired ?? null,
  }));

  if (!force && prevThesis?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      sector,
      version: prevVersion,
      thesis_updated_at: sectorRow.thesis_updated_at,
    };
  }

  // ---------- Prompt ----------
  const prompt = buildPrompt({
    sector,
    macroRegime:  macroRow.regime || "unclassified",
    macroDrivers: macroThesis.drivers || [],
    macroTripwires: macroThesis.tripwires || [],
    sectorFactors,
    indRows,
    driftVerdict,
    driftStructured,
    prevThesis,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-sector-thesis" });
  validateThesis(blob);

  const now = new Date().toISOString();
  const thesis = {
    prose:        blob.prose.trim(),
    drivers:      blob.drivers,
    tripwires:    blob.tripwires,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow.regime ?? null,
    drift_verdict_at_write: driftVerdict,
  };

  await db.prepare(
    `UPDATE SECTOR_TREND_long
        SET thesis_json       = ?,
            thesis_updated_at = ?,
            thesis_model      = ?
      WHERE sector = ?`,
  ).bind(JSON.stringify(thesis), now, MODEL, sector).run();

  return {
    action: "wrote",
    sector,
    version: thesis.version,
    drivers_count: thesis.drivers.length,
    tripwires_count: thesis.tripwires.length,
    thesis_updated_at: now,
  };
}

function buildPrompt({ sector, macroRegime, macroDrivers, macroTripwires, sectorFactors, indRows, driftVerdict, driftStructured, prevThesis }) {
  const macroDriversBlock   = macroDrivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)";
  const macroTripwiresBlock = macroTripwires.map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)";
  const sfBlock = `  date:                ${sectorFactors.date}
  regime_fit:          ${fmtNum(sectorFactors.regime_fit)}            (× regime affinity, [-1, +1])
  valuation_sigma:     ${fmtNum(sectorFactors.valuation_sigma)}σ      (sector fwd_pe vs 252d trend)
  rel_strength_13w:    ${fmtNum(sectorFactors.rel_strength_13w)}      (sector ETF − SPY, 63d return)
  rs_ratio (RRG x):    ${fmtNum(sectorFactors.rs_ratio)}              (centered at 100)
  rs_momentum (RRG y): ${fmtNum(sectorFactors.rs_momentum)}           (centered at 100)
  breadth_above_200d:  ${fmtNum(sectorFactors.breadth_above_200dma)}
  earn_momentum:       ${fmtNum(sectorFactors.earn_momentum)}         (mean of constituent eps_rev_4w)
  fwd_pe_sector:       ${fmtNum(sectorFactors.fwd_pe_sector)}
  stance:              ${sectorFactors.stance ?? "?"} (score ${fmtNum(sectorFactors.stance_score)})`;
  const indBlock = indRows.length
    ? indRows.map(r => {
        const v  = fmtNum(r.value);
        const dd = r.delta_1m == null ? "n/a" : `${r.delta_1m >= 0 ? "+" : ""}${fmtNum(r.delta_1m)}`;
        const zz = r.z_vs_24m == null ? "n/a" : `${r.z_vs_24m >= 0 ? "+" : ""}${fmtNum(r.z_vs_24m)}σ`;
        return `  ${r.indicator_code.padEnd(20)} ${v}${r.unit ? " " + r.unit : ""}  |  Δ1m ${dd}  |  Z ${zz}   (${r.release_date})`;
      }).join("\n")
    : "  (no MACRO_STATE_indicators rows for this sector's slice)";

  const prevBlock = prevThesis
    ? `Version: ${prevThesis.version ?? "?"} (last updated ${prevThesis.last_updated ?? "?"})
Prose: ${prevThesis.prose ?? "(missing)"}
Drivers:
${(prevThesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)"}
Tripwires:
${(prevThesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)"}`
    : "(no prior sector thesis — this is the first version)";

  return `You are a senior sector analyst at a hedge fund. Maintain the load-bearing story for the ${sector} sector right now and whether it is intact.

MACRO REGIME (top-level context)
  Label: ${macroRegime}

MACRO THESIS DRIVERS
${macroDriversBlock}

MACRO THESIS TRIPWIRES
${macroTripwiresBlock}

SECTOR FACTORS (SECTOR_FACTORS_daily — current snapshot for ${sector})
${sfBlock}

SECTOR-SPECIFIC RAW RELEASES (current value | 1m delta | Z vs 24m)
${indBlock}

SECTOR NEWS DRIFT
  Verdict: ${driftVerdict}
  Driver drift signs: ${driftStructured?.driver_drift ? JSON.stringify(driftStructured.driver_drift) : "(none yet)"}
  Tripwires fired:    ${driftStructured?.tripwires_fired ? JSON.stringify(driftStructured.tripwires_fired) : "[]"}

PREVIOUS SECTOR THESIS (drift gradually — only swap when data demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one paragraph, 4-7 sentences. Must reference specific values from the sector factors AND raw releases above. State whether the sector thesis is intact, weakening, or breaking.>",
  "drivers": [
    {
      "name":      "<3-6 word sector-specific frame, e.g. 'OPEC+ discipline holding', 'capital discipline post-2014 bust', 'AI capex tailwind'>",
      "rationale": "<one sentence anchored in the sector factors / releases above>"
    }
  ],
  "tripwires": [
    {
      "id":        "<short slug, e.g. 'wti_below_70', 'rig_count_700', 'breadth_below_30'>",
      "condition": "<measurable, e.g. 'WTI < $65 for 2 weeks', 'rig count > 700', 'sector breadth < 30%'>",
      "currently": "<one short clause: where we are vs the threshold, with the actual number>"
    }
  ]
}

RULES
- 3-5 drivers. 3-5 tripwires. Quality over quantity.
- Drivers must be SECTOR-SPECIFIC (not macro). Reference sector domain language (rig count, breadth, MIS, freight rates, etc.).
- Tripwires must be MEASURABLE and use the specific values from the inputs as the current reading.
- If prior thesis still holds in spirit, keep its drivers / tripwires (same names/ids), only edit prose to reflect fresh values. Swap when the data demands.
- Prose must take a position. Avoid hedging language. Land on intact / weakening / breaking.
- If a sector raw release shows |Z| > 1.5, surface it explicitly in the prose with the actual value.`;
}

function fmtNum(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validateThesis(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!Array.isArray(blob.drivers) || blob.drivers.length < 3 || blob.drivers.length > 5) {
    throw new Error(`invalid output: drivers must be 3-5, got ${blob.drivers?.length ?? "?"}`);
  }
  for (const d of blob.drivers) {
    if (!d || typeof d.name !== "string" || typeof d.rationale !== "string")
      throw new Error("invalid driver: needs {name, rationale}");
  }
  if (!Array.isArray(blob.tripwires) || blob.tripwires.length < 3 || blob.tripwires.length > 5) {
    throw new Error(`invalid output: tripwires must be 3-5, got ${blob.tripwires?.length ?? "?"}`);
  }
  for (const t of blob.tripwires) {
    if (!t || typeof t.id !== "string" || typeof t.condition !== "string" || typeof t.currently !== "string")
      throw new Error("invalid tripwire: needs {id, condition, currently}");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
