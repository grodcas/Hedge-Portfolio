/**
 * TICKER-ESTIMATES-AGENT (#3 Estimates reading) — per [TICKER_PIPELINE.md §3].
 *
 * One paragraph on whether sell-side revisions confirm or fade the thesis,
 * and where the structural fade year sits.
 *
 * Inputs (per ticker):
 *   - FUND_03_Estimates rows for FY, FY+1, FY+2 (and any FY+3 present).
 *     Each row carries eps_consensus, rev_consensus, eps_revisions_30d,
 *     rev_revisions_30d, eps_dispersion, period_kind, fiscal_year.
 *   - STOCK_FACTORS_daily.eps_rev_4w + sue + rev_breadth_4w (the 4-week
 *     revision tape — independent of the 30d field above).
 *   - Prior thesis drivers (revisions read against the actual story).
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "revisions_up" | "flat" | "revisions_down",
 *     fade_year: "FY" | "FY+1" | "FY+2" | "FY+3" | "none",
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{estimates_json, _updated_at, _model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_VERDICTS  = new Set(["revisions_up", "flat", "revisions_down"]);
const VALID_FADE_YEAR = new Set(["FY", "FY+1", "FY+2", "FY+3", "none"]);

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
      const out = await build(env, env.DB, apiKey, ticker, force);
      return Response.json({ ok: true, ...out });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};

async function build(env, db, apiKey, ticker, force) {
  const [trendRow, estRes, factorsRow, lastQuarterlyRow] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, estimates_json, estimates_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT period_label, period_kind, fiscal_year,
              eps_consensus, rev_consensus,
              eps_revisions_30d, rev_revisions_30d, eps_dispersion, source
         FROM FUND_03_Estimates WHERE ticker = ?
        ORDER BY fiscal_year ASC LIMIT 6`,
    ).bind(ticker).all(),
    db.prepare(
      `SELECT date, eps_rev_4w, rev_breadth_4w, sue
         FROM STOCK_FACTORS_daily WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
    // Latest reported fiscal_period_ending lets us drop FUND_03 estimate
    // rows whose fiscal year has already been fully reported. AV's
    // EARNINGS_ESTIMATES response keeps the most-recent reported FY in
    // the response; without this filter the agent describes "FY2026 EPS
    // 4.694" for NVDA as a forward consensus even though FY26 is already
    // closed and the actual was 4.90.
    db.prepare(
      `SELECT fiscal_period_ending FROM FUND_01_Quarterly
        WHERE ticker = ? ORDER BY fiscal_period_ending DESC LIMIT 1`,
    ).bind(ticker).first(),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  const allEstimates = estRes?.results || [];
  // Drop estimate rows whose fiscal_year <= the most recently reported
  // fiscal year. For NVDA, latest_quarterly = 2026-01-25 → fiscal_year 2026
  // is closed, so the agent only sees 2027 (FY), 2028 (FY+1), 2029 (FY+2).
  const lastReportedFY = lastQuarterlyRow?.fiscal_period_ending
    ? parseInt(String(lastQuarterlyRow.fiscal_period_ending).slice(0, 4), 10)
    : null;
  const estimates = lastReportedFY
    ? allEstimates.filter(e => e.fiscal_year > lastReportedFY)
    : allEstimates;
  if (estimates.length === 0) {
    throw new Error(`no forward FUND_03_Estimates rows for ${ticker} — run consensus-fetcher first`);
  }

  const thesis  = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const drivers = Array.isArray(thesis?.drivers) ? thesis.drivers : [];

  const prevEst   = trendRow.estimates_json ? safeJson(trendRow.estimates_json) : null;
  const prevVersion = Number.isInteger(prevEst?.version) ? prevEst.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    estimates: estimates.map(e => [
      e.fiscal_year, e.eps_consensus, e.rev_consensus,
      e.eps_revisions_30d, e.rev_revisions_30d, e.eps_dispersion,
    ]),
    factors: factorsRow ? [factorsRow.eps_rev_4w, factorsRow.rev_breadth_4w, factorsRow.sue] : null,
    drivers: drivers.map(d => d.name),
  }));

  if (!force && prevEst?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      estimates_updated_at: trendRow.estimates_updated_at,
    };
  }

  const prompt = buildPrompt({ ticker, estimates, factorsRow, drivers, prevEst });
  const blob = await callLLM(apiKey, prompt, { model: MODEL, env, caller: "ticker-estimates" });
  validate(blob);

  const now = new Date().toISOString();
  const est = {
    prose:        blob.prose.trim(),
    verdict:      blob.verdict,
    fade_year:    blob.fade_year,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET estimates_json       = ?,
            estimates_updated_at = ?,
            estimates_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(est), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: est.version,
    verdict: est.verdict,
    fade_year: est.fade_year,
    estimates_updated_at: now,
  };
}

function buildPrompt({ ticker, estimates, factorsRow, drivers, prevEst }) {
  // Label rows as FY / FY+1 / FY+2 from earliest to latest fiscal_year.
  // The LLM can then reason about the fade year using these slot names.
  const labels = ["FY", "FY+1", "FY+2", "FY+3", "FY+4", "FY+5"];
  const estBlock = estimates.map((e, i) => {
    const slot = labels[i] || `FY+${i}`;
    return `  ${slot.padEnd(5)} ${e.period_label.padEnd(8)} (${e.period_kind})  eps=${fmtNum(e.eps_consensus)}  rev=${fmtMoney(e.rev_consensus)}  eps_rev_30d=${fmtNum(e.eps_revisions_30d)}  rev_rev_30d=${fmtNum(e.rev_revisions_30d)}  disp=${fmtNum(e.eps_dispersion)}`;
  }).join("\n");

  const factorsBlock = factorsRow
    ? `  date:           ${factorsRow.date}
  eps_rev_4w:     ${fmtNum(factorsRow.eps_rev_4w)}     (4w EPS revision tape)
  rev_breadth_4w: ${fmtNum(factorsRow.rev_breadth_4w)} (breadth of revisions)
  sue:            ${fmtNum(factorsRow.sue)}            (last surprise σ)`
    : "  (no STOCK_FACTORS_daily row)";

  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no prior thesis — call this first version)";

  const prevBlock = prevEst
    ? `Version: ${prevEst.version} (last updated ${prevEst.last_updated})
Verdict: ${prevEst.verdict}, fade_year: ${prevEst.fade_year}
Prose: ${prevEst.prose}`
    : "(no prior estimates reading)";

  return `You are a senior equity analyst writing the estimates reading for ${ticker}. One short paragraph on whether sell-side revisions confirm or fade the thesis, plus the structural fade year (the first FY where the curve flattens or rolls).

PRIOR THESIS DRIVERS
${driversBlock}

CONSENSUS ESTIMATES (FUND_03_Estimates — slot labels assigned by fiscal_year ascending)
${estBlock}

REVISION TAPE (STOCK_FACTORS_daily — 4w window, independent of the 30d above)
${factorsBlock}

PREVIOUS ESTIMATES READING (drift gradually — only flip verdict when revisions demand)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Reference SPECIFIC EPS / revenue numbers and revision deltas. State whether revisions confirm or fade each driver.>",
  "verdict": "revisions_up" | "flat" | "revisions_down",
  "fade_year": "FY" | "FY+1" | "FY+2" | "FY+3" | "none"
}

RULES
- Reference at least one explicit EPS or revenue figure with its slot label.
- "revisions_up" requires positive eps_rev / rev_rev on FY AND FY+1, OR clearly positive eps_rev_4w with no offsetting dispersion spike.
- "revisions_down" requires negative on FY AND FY+1, OR sharply negative eps_rev_4w.
- Otherwise "flat".
- fade_year is the FIRST slot where the EPS or revenue growth meaningfully decelerates (i.e. growth rate FY+N < FY+N-1 by more than the noise band). If estimates rise monotonically, set "none".
- Never invent slots beyond what the table shows.
- Do not hedge — pick one verdict and one fade_year value.`;
}

function fmtNum(v) {
  if (v == null) return "(unavailable)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(unavailable)";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(3);
}
function fmtMoney(v) {
  if (v == null) return "(unavailable)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(unavailable)";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict))    throw new Error(`invalid verdict: ${blob.verdict}`);
  if (!VALID_FADE_YEAR.has(blob.fade_year)) throw new Error(`invalid fade_year: ${blob.fade_year}`);
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
