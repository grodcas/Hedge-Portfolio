/**
 * TICKER-RECOMMENDATION-AGENT (#9 Recommendation) — per [TICKER_PIPELINE.md §9].
 *
 * Turns the thesis into a concrete action with Δ-weight and a window.
 *
 * Inputs (per ticker):
 *   - Thesis drivers + tripwires (TICKER_TREND_long.thesis_json)
 *   - Per-driver drift signs + tripwires fired (TICKER_TREND_long.news_drift_json
 *     — only the structured fields, per spec; not the full drift paragraph)
 *   - Valuation z-score (STOCK_FACTORS_daily.rel_pe_sigma)
 *   - Position size (POSITION_01_Daily.weight_pct)
 *   - Nearest catalyst (STOCK_FACTORS_daily.days_to_catalyst)
 *   - Book risk caps  (NOT YET in DB — placeholder until config table lands;
 *                      same deferral as macro-positioning-agent)
 *
 * Output (validated):
 *   {
 *     action:    string,             // imperative sentence
 *     delta_weight_pct: number,      // signed % of NAV (e.g. -1.5 = trim 1.5%)
 *     window:    "today" | "this_week" | "weeks" | "months",
 *     stance:    "add" | "hold" | "trim" | "exit",
 *     rationale: string,             // 1-2 sentences citing drivers/drift
 *     version, last_updated, input_fingerprint, ticker_at_write,
 *     thesis_version_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{recommendation_json,_updated_at,_model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_WINDOWS = new Set(["today", "this_week", "weeks", "months"]);
const VALID_STANCES = new Set(["add", "hold", "trim", "exit"]);

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
  const [trendRow, factorsRow, posRow] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, news_drift_json,
              recommendation_json, recommendation_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT date, rel_pe_sigma, days_to_catalyst, fwd_pe, peer_median_pe
         FROM STOCK_FACTORS_daily WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT date, weight_pct, market_value, qty
         FROM POSITION_01_Daily WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!trendRow.thesis_json) throw new Error(`no thesis_json yet for ${ticker} (#7 must fire first)`);

  const thesis = JSON.parse(trendRow.thesis_json);
  const drift  = trendRow.news_drift_json ? safeJson(trendRow.news_drift_json) : null;

  const drivers   = thesis.drivers   || [];
  const tripwires = thesis.tripwires || [];
  const drift_signs = drift?.driver_drift   || {};
  const fired       = drift?.tripwires_fired || [];

  const prevRec = trendRow.recommendation_json ? safeJson(trendRow.recommendation_json) : null;
  const prevVersion = Number.isInteger(prevRec?.version) ? prevRec.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    thesis_version: thesis.version || null,
    drivers:        drivers.map(d => d.name),
    tripwires:      tripwires.map(t => t.id),
    drift_signs,
    fired,
    factors:        factorsRow ? [factorsRow.rel_pe_sigma, factorsRow.days_to_catalyst, factorsRow.fwd_pe] : null,
    position:       posRow ? [posRow.weight_pct, posRow.market_value] : null,
  }));

  if (!force && prevRec?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      recommendation_updated_at: trendRow.recommendation_updated_at,
    };
  }

  const prompt = buildPrompt({
    ticker, thesis, drift, drivers, tripwires, drift_signs, fired,
    factorsRow, posRow, prevRec,
  });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob);

  const now = new Date().toISOString();
  const rec = {
    action:           blob.action.trim(),
    delta_weight_pct: blob.delta_weight_pct,
    window:           blob.window,
    stance:           blob.stance,
    rationale:        blob.rationale.trim(),
    version:          prevVersion + 1,
    last_updated:     now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
    thesis_version_at_write: thesis.version || null,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET recommendation_json       = ?,
            recommendation_updated_at = ?,
            recommendation_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(rec), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: rec.version,
    stance: rec.stance,
    delta_weight_pct: rec.delta_weight_pct,
    window: rec.window,
    recommendation_updated_at: now,
  };
}

function buildPrompt({ ticker, thesis, drift, drivers, tripwires, drift_signs, fired, factorsRow, posRow, prevRec }) {
  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}  (drift: ${drift_signs[d.name] ?? 0})`).join("\n")
    : "  (no drivers)";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => {
        const isFired = fired.includes(t.id);
        return `  - [${t.id}]${isFired ? " 🔥 FIRED" : ""}  ${t.condition} — currently: ${t.currently}`;
      }).join("\n")
    : "  (no tripwires)";

  const positionBlock = posRow
    ? `  date:         ${posRow.date}
  weight_pct:   ${fmtNum(posRow.weight_pct)}%
  market_value: ${fmtMoney(posRow.market_value)}
  qty:          ${fmtNum(posRow.qty)}`
    : "  (no POSITION_01_Daily row — treat as not currently held)";

  const factorsBlock = factorsRow
    ? `  date:              ${factorsRow.date}
  rel_pe_sigma:      ${fmtNum(factorsRow.rel_pe_sigma)}σ   (vs sector trend; + = expensive, − = cheap)
  fwd_pe:            ${fmtNum(factorsRow.fwd_pe)}
  peer_median_pe:    ${fmtNum(factorsRow.peer_median_pe)}
  days_to_catalyst:  ${fmtNum(factorsRow.days_to_catalyst)}d`
    : "  (no STOCK_FACTORS_daily row)";

  const prevBlock = prevRec
    ? `Version: ${prevRec.version} (last updated ${prevRec.last_updated})
Action:  ${prevRec.action}
Δ:       ${prevRec.delta_weight_pct}% (${prevRec.window}) — stance ${prevRec.stance}
Rationale: ${prevRec.rationale}`
    : "(no prior recommendation)";

  return `You are a senior portfolio manager turning the ${ticker} thesis into a concrete action with Δ-weight and a window.

THESIS DRIVERS (with drift sign from #5)
${driversBlock}

THESIS TRIPWIRES
${tripwiresBlock}

VALUATION + CATALYST (STOCK_FACTORS_daily)
${factorsBlock}

CURRENT POSITION (POSITION_01_Daily)
${positionBlock}

BOOK RISK CAPS
  (none configured — assume single-name cap of 5% of NAV; no add if already > 4%)

PREVIOUS RECOMMENDATION (drift gradually — only flip stance when signal demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "action":           "<imperative sentence, e.g. 'Trim 25% of position pre-print', 'Add 50bps now', 'Hold; reassess after FOMC'>",
  "delta_weight_pct": <signed number — % of NAV. Positive = add, negative = trim, 0 = hold>,
  "window":           "today" | "this_week" | "weeks" | "months",
  "stance":           "add" | "hold" | "trim" | "exit",
  "rationale":        "<1-2 sentences citing 1-2 drivers + drift signs + the catalyst date if relevant>"
}

RULES
- Do NOT consume fundamentals reading text, peer comps text, context text, or the full drift paragraph. Only the structured fields above.
- "exit" requires a tripwire FIRED OR a driver at -2 with the position currently held.
- "add" requires net-positive driver drift AND rel_pe_sigma < +1.0 AND weight_pct < 4%.
- "trim" requires net-negative drift OR rel_pe_sigma > +1.5 OR a tripwire near-fire.
- Otherwise "hold".
- delta_weight_pct sign MUST agree with stance: add → positive, trim/exit → negative, hold → 0.
- |delta_weight_pct| must be ≤ 2.5% per single recommendation (one move at a time; risk cap soft rule).
- If days_to_catalyst < 5d, prefer "today" or "this_week" window.
- Never hedge — pick one stance and one window.`;
}

function fmtNum(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}
function fmtMoney(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.action    !== "string" || blob.action.trim().length    < 5) throw new Error("invalid action");
  if (typeof blob.rationale !== "string" || blob.rationale.trim().length < 20) throw new Error("invalid rationale");
  if (!VALID_STANCES.has(blob.stance)) throw new Error(`invalid stance: ${blob.stance}`);
  if (!VALID_WINDOWS.has(blob.window)) throw new Error(`invalid window: ${blob.window}`);
  if (typeof blob.delta_weight_pct !== "number" || !Number.isFinite(blob.delta_weight_pct)) {
    throw new Error("invalid delta_weight_pct");
  }
  if (Math.abs(blob.delta_weight_pct) > 2.5) {
    throw new Error(`delta_weight_pct out of range: ${blob.delta_weight_pct} (|·| must be ≤ 2.5)`);
  }
  // Sign-stance agreement.
  if (blob.stance === "add"  && blob.delta_weight_pct <= 0) throw new Error("stance=add requires delta_weight_pct > 0");
  if (blob.stance === "hold" && blob.delta_weight_pct !== 0) throw new Error("stance=hold requires delta_weight_pct = 0");
  if ((blob.stance === "trim" || blob.stance === "exit") && blob.delta_weight_pct >= 0) {
    throw new Error(`stance=${blob.stance} requires delta_weight_pct < 0`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
