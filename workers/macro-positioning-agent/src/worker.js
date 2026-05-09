/**
 * MACRO-POSITIONING-AGENT (M4) — translate the macro thesis into book tilts.
 *
 * Per [MAP_PIPELINE.md §M4]. Output: stance per asset class / sector tilt
 * with magnitude + window. The macro analogue of Ticker's Recommendation.
 *
 * Inputs:
 *   - Thesis drivers + tripwires (BETA_10_Daily_macro.thesis_json)
 *   - Per-driver drift signs                  HARDCODED null until M1 (MS-3e)
 *   - Tripwire flags fired                    HARDCODED [] until M1 (MS-3e)
 *   - Macro indicator panel (raw values + delta_1m + z_vs_24m, same source
 *     as M2)
 *   - Current book composition (PORTFOLIO_01_Holdings + sector map)
 *   - Book risk caps                          NOT YET in DB; passed as
 *                                             "(none configured)" placeholder
 *                                             until a config table lands.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     tilts: [{
 *       scope:     "asset_class" | "sector",
 *       name:      string,        // "Energy", "long-duration tech", "credit", "cash"
 *       stance:    "OW" | "UW" | "neutral",
 *       magnitude: 1..5,          // 1 = small, 5 = max book conviction
 *       window:    "weeks" | "months" | "quarters",
 *       rationale: string         // one sentence, anchored in driver(s)
 *     }],
 *     version, last_updated, input_fingerprint, regime_at_write
 *   }
 *
 * Writes BETA_10_Daily_macro.{positioning_json, _updated_at, _model}.
 * Endpoints: GET /build[?force=1].
 * Cron is wired by agent-orchestrator (MS-2c).
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";

// Canonical 8-sector SPDR/GICS map (matches operations-agent /
// stock-factor-builder / sector-factor-builder).  Used to bucket
// PORTFOLIO_01_Holdings by sector for the book composition input.
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

const CROSS_ASSET_CODES = new Set([
  "FEDFUNDS", "FED_TARGET_UPPER", "FED_TARGET_LOWER",
  "DGS2", "DGS10", "REAL_5Y", "BREAKEVEN_5Y", "BREAKEVEN_5Y5Y_FWD",
  "OAS_IG", "OAS_HY",
  "FED_TOTAL_ASSETS", "BANK_RESERVES",
  "DXY_BROAD", "WTI", "GOLD", "EURUSD", "COPPER",
  "VIX", "VVIX", "SKEW",
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build") return new Response("Not found", { status: 404 });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
    try {
      const out = await build(env, env.DB, apiKey, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, force) {
  const macroRow = await db.prepare(
    `SELECT id, regime, confidence, thesis_json,
            positioning_json, positioning_updated_at, creation_date
       FROM BETA_10_Daily_macro
      ORDER BY creation_date DESC LIMIT 1`,
  ).first();
  if (!macroRow) throw new Error("no BETA_10_Daily_macro row — run macro-intelligence-builder first");
  if (!macroRow.thesis_json) throw new Error("no thesis_json yet — fire macro-thesis-agent first");

  const thesis = JSON.parse(macroRow.thesis_json);

  // Indicator panel (same source M2 reads).
  const indRes = await db.prepare(
    `SELECT i.indicator_code, i.indicator_name, i.value, i.unit,
            i.delta_1m, i.z_vs_24m, i.release_date
       FROM MACRO_STATE_indicators i
       INNER JOIN (
         SELECT indicator_code, MAX(release_date) AS d
           FROM MACRO_STATE_indicators
          GROUP BY indicator_code
       ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
      ORDER BY i.indicator_code`,
  ).all();
  const indicators = indRes.results || [];
  const panel = indicators.filter(r => !CROSS_ASSET_CODES.has(r.indicator_code));

  // Book composition: aggregate PORTFOLIO_01_Holdings by sector via
  // SECTOR_MAP. Anything not in SECTOR_MAP is bucketed as "Other".
  const holdRes = await db.prepare(
    `SELECT ticker, weight_pct FROM PORTFOLIO_01_Holdings`,
  ).all();
  const sectorWeights = {};
  let bookTotal = 0;
  for (const h of holdRes.results || []) {
    if (h.weight_pct == null) continue;
    const sec = TICKER_TO_SECTOR[h.ticker] || "Other";
    sectorWeights[sec] = (sectorWeights[sec] || 0) + h.weight_pct;
    bookTotal += h.weight_pct;
  }

  const driftSigns    = null;   // M1 News drift not wired (deferred MS-3e)
  const tripwiresFired = [];    // same — orchestrator can't pass them yet

  // Fingerprint over every input the prompt renders.
  const prevPositioning = macroRow.positioning_json ? safeJson(macroRow.positioning_json) : null;
  const prevVersion = Number.isInteger(prevPositioning?.version) ? prevPositioning.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    thesis_drivers:  thesis.drivers,
    thesis_tripwires: thesis.tripwires,
    regime: macroRow.regime,
    drift_signs: driftSigns,
    tripwires_fired: tripwiresFired,
    panel: panel.map(r => [r.indicator_code, r.value, r.delta_1m, r.z_vs_24m]),
    book:  sectorWeights,
  }));

  if (!force && prevPositioning?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      version: prevVersion,
      positioning_updated_at: macroRow.positioning_updated_at,
    };
  }

  const prompt = buildPrompt({
    regime:          macroRow.regime || "unclassified",
    thesis,
    panel,
    sectorWeights,
    bookTotal,
    driftSigns,
    tripwiresFired,
    prevPositioning,
  });

  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "macro-positioning" });
  validatePositioning(blob);

  const now = new Date().toISOString();
  const positioning = {
    prose:        blob.prose.trim(),
    tilts:        blob.tilts,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    regime_at_write: macroRow.regime ?? null,
  };

  await db.prepare(
    `UPDATE BETA_10_Daily_macro
        SET positioning_json       = ?,
            positioning_updated_at = ?,
            positioning_model      = ?
      WHERE id = ?`,
  ).bind(JSON.stringify(positioning), now, MODEL, macroRow.id).run();

  return {
    action: "wrote",
    macro_row_id: macroRow.id,
    version: positioning.version,
    tilts_count: positioning.tilts.length,
    positioning_updated_at: now,
  };
}

function buildPrompt({ regime, thesis, panel, sectorWeights, bookTotal, driftSigns, tripwiresFired, prevPositioning }) {
  const driversBlock = (thesis.drivers || []).map(d => `  - ${d.name}: ${d.rationale}`).join("\n") || "  (none)";
  const tripwiresBlock = (thesis.tripwires || []).map(t => `  - [${t.id}] ${t.condition} — currently: ${t.currently}`).join("\n") || "  (none)";
  const panelBlock = panel.length
    ? panel.map(r => {
        const v  = fmtNum(r.value);
        const dd = r.delta_1m == null ? "n/a" : `${r.delta_1m >= 0 ? "+" : ""}${fmtNum(r.delta_1m)}`;
        const zz = r.z_vs_24m == null ? "n/a" : `${r.z_vs_24m >= 0 ? "+" : ""}${fmtNum(r.z_vs_24m)}σ`;
        return `  ${r.indicator_code.padEnd(20)} ${v}${r.unit ? " " + r.unit : ""}  |  Δ1m ${dd}  |  Z ${zz}   (${r.release_date})`;
      }).join("\n")
    : "  (no panel rows)";

  const bookBlock = Object.keys(sectorWeights).length
    ? Object.entries(sectorWeights)
        .sort((a, b) => b[1] - a[1])
        .map(([sec, w]) => `  ${sec.padEnd(14)} ${w.toFixed(2)}%`)
        .join("\n") + `\n  ─────────────────\n  TOTAL          ${bookTotal.toFixed(2)}%`
    : "  (PORTFOLIO_01_Holdings is empty)";

  const driftBlock = driftSigns
    ? Object.entries(driftSigns).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    : "  (M1 News drift not wired yet — assume signs are 0/intact)";

  const tripFiredBlock = tripwiresFired.length
    ? tripwiresFired.map(t => `  - ${t}`).join("\n")
    : "  (none fired)";

  const prevBlock = prevPositioning
    ? `Version: ${prevPositioning.version ?? "?"} (last updated ${prevPositioning.last_updated ?? "?"})
Prose: ${prevPositioning.prose ?? "(missing)"}
Tilts:
${(prevPositioning.tilts || []).map(t => `  - ${t.scope}/${t.name}: ${t.stance} ${t.magnitude} (${t.window}) — ${t.rationale}`).join("\n") || "  (none)"}`
    : "(no prior positioning — this is the first version)";

  return `You are a senior portfolio manager translating the macro thesis into a concrete book tilt. Output stance per asset class and per sector with magnitude and time window.

REGIME (deterministic classifier)
  Label: ${regime}

THESIS DRIVERS
${driversBlock}

THESIS TRIPWIRES
${tripwiresBlock}

PER-DRIVER NEWS-DRIFT SIGNS (M1, deferred)
${driftBlock}

TRIPWIRES FIRED RIGHT NOW
${tripFiredBlock}

MACRO INDICATOR PANEL (current value | 1m delta | Z vs 24m)
${panelBlock}

CURRENT BOOK COMPOSITION (PORTFOLIO_01_Holdings, by sector)
${bookBlock}

BOOK RISK CAPS
  (none configured — assume ±5% per sector tilt is the soft cap)

PREVIOUS POSITIONING (drift gradually — only swap when data demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Reference specific drivers + values. State whether the tilt is increasing, holding, or fading vs prior.>",
  "tilts": [
    {
      "scope":     "asset_class" | "sector",
      "name":      "<e.g. 'Energy', 'long-duration tech', 'credit', 'cash', 'duration'>",
      "stance":    "OW" | "UW" | "neutral",
      "magnitude": 1,            // integer 1..5 — 1 small, 5 max book conviction
      "window":    "weeks" | "months" | "quarters",
      "rationale": "<one sentence anchored in a thesis driver or panel value>"
    }
  ]
}

RULES
- 4–8 tilts total. Cover the major asset classes (rates / credit / equity factor / commodities / cash) AND the sectors where you have a directional view. A "neutral" with magnitude=0... no — if neutral, stance="neutral" and magnitude=0; you may include neutrals only when the prior was OW/UW and you are now flat.
- Every magnitude > 0 needs a rationale grounded in either a thesis driver or a specific indicator value.
- If the panel shows |Z| > 1.5 on a series that anchors a driver, REFLECT that in magnitude (e.g. fresh hot inflation print → larger UW long-duration tilt).
- Honor the soft cap: do not stack > +5 across all sector OWs. Cash is the residual.
- If prior positioning is unchanged in spirit, KEEP the tilts (same name + stance), only adjust magnitude / window. New tilts only when a new driver or tripwire breach justifies one.
- Prose must take a position; no hedging language.
- TERMINOLOGY: When citing the broad-dollar indicator (indicator_code DXY_BROAD, currently 117–120 range), ALWAYS label it "Broad USD" or "Trade-Weighted USD". DO NOT write "DXY" — that's the ICE 6-currency index trading near 98, a DIFFERENT number. Mixing the two confuses readers.`;
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

function validatePositioning(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid LLM output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 30) {
    throw new Error("invalid LLM output: prose missing or too short");
  }
  if (!Array.isArray(blob.tilts) || blob.tilts.length < 4 || blob.tilts.length > 8) {
    throw new Error(`invalid LLM output: tilts must be 4-8, got ${blob.tilts?.length ?? "?"}`);
  }
  for (const t of blob.tilts) {
    if (!t || !["asset_class", "sector"].includes(t.scope))
      throw new Error("invalid tilt: scope must be 'asset_class' or 'sector'");
    if (typeof t.name !== "string" || !t.name.trim())
      throw new Error("invalid tilt: name missing");
    if (!["OW", "UW", "neutral"].includes(t.stance))
      throw new Error("invalid tilt: stance must be OW/UW/neutral");
    if (!Number.isInteger(t.magnitude) || t.magnitude < 0 || t.magnitude > 5)
      throw new Error("invalid tilt: magnitude must be int 0..5");
    if (!["weeks", "months", "quarters"].includes(t.window))
      throw new Error("invalid tilt: window must be weeks/months/quarters");
    if (typeof t.rationale !== "string" || !t.rationale.trim())
      throw new Error("invalid tilt: rationale missing");
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
