/**
 * TICKER-EARNINGS-SUMMARY-AGENT (#11 Earnings summary) — per [TICKER_PIPELINE.md §11].
 *
 * Bullet summary of the most recent earnings event for this ticker. Cached
 * until the NEXT earnings event is parsed. Independent of the per-refresh
 * agents — runs at quarter cadence. Same shape as M7 (FOMC summary).
 *
 * Inputs (per ticker):
 *   - Most recent FUND_02_Earnings row (period, estimate, actual, surprise,
 *     surprise_pct, report_date)
 *   - Prior 3 FUND_02_Earnings rows (for delta context)
 *   - Most recent FUND_01_Quarterly row at-or-before report_date — for
 *     headline financials (revenue, op_inc, net_income, EBITDA, capex). Often
 *     empty in current DB — handled gracefully.
 *   - Ticker thesis drivers + tripwires (used to FLAG which bullets touch a
 *     driver — same principle as M7. Not a filter; a complete summary is
 *     the point.)
 *
 * Earnings call transcripts, press releases, MD&A snippets, and earnings
 * decks per the spec are NOT YET INGESTED. Bullets from the LLM will be
 * grounded in the surprise + headline financials only until those upstream
 * sources land. Sources are tagged "release" until transcripts arrive.
 *
 * Output (validated):
 *   {
 *     bullets: [{
 *       angle:        "rev_beat" | "guidance" | "segment" | "margin" |
 *                     "capex" | "capital_return" | "risks",
 *       claim:        string,
 *       driver_tag:   string | null,        // null if doesn't touch a driver
 *       tripwire_tag: string | null,
 *       source:       "release" | "transcript" | "deck" | "mda"
 *     }],
 *     bullet_count, surprise_pct, report_date,
 *     period, version, last_updated, input_fingerprint, ticker_at_write,
 *     earnings_period_at_write    // for the orchestrator gate
 *   }
 *
 * Writes TICKER_TREND_long.{earnings_summary_json,_updated_at,_model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_ANGLES  = new Set(["rev_beat", "guidance", "segment", "margin", "capex", "capital_return", "risks"]);
const VALID_SOURCES = new Set(["release", "transcript", "deck", "mda"]);

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
  const [trendRow, recentEarn, priorEarnRes] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, earnings_summary_json, earnings_summary_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT period, estimate, actual, surprise, surprise_pct, report_date
         FROM FUND_02_Earnings WHERE ticker = ?
        ORDER BY report_date DESC LIMIT 1`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT period, estimate, actual, surprise, surprise_pct, report_date
         FROM FUND_02_Earnings WHERE ticker = ?
        ORDER BY report_date DESC LIMIT 4`,
    ).bind(ticker).all(),
  ]);
  if (!trendRow)   throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!recentEarn) throw new Error(`no FUND_02_Earnings rows for ${ticker} — earnings-fetcher must run first`);

  // Headline financials at-or-before report_date (most recent quarterly row).
  const headlineQ = await db.prepare(
    `SELECT fiscal_period_ending, total_revenue, gross_profit, operating_income,
            net_income, ebitda, capex, dividends_paid, buyback
       FROM FUND_01_Quarterly WHERE ticker = ?
        AND fiscal_period_ending <= ?
       ORDER BY fiscal_period_ending DESC LIMIT 1`,
  ).bind(ticker, recentEarn.report_date).first();

  const thesis    = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const drivers   = Array.isArray(thesis?.drivers)   ? thesis.drivers   : [];
  const tripwires = Array.isArray(thesis?.tripwires) ? thesis.tripwires : [];

  const prevSummary = trendRow.earnings_summary_json ? safeJson(trendRow.earnings_summary_json) : null;
  const prevVersion = Number.isInteger(prevSummary?.version) ? prevSummary.version : 0;

  // Cache check: if we already have a summary for this period, no-op.
  if (!force && prevSummary?.earnings_period_at_write === recentEarn.period) {
    return {
      action: "noop",
      reason: `cached for period ${recentEarn.period}`,
      ticker,
      version: prevVersion,
      earnings_summary_updated_at: trendRow.earnings_summary_updated_at,
    };
  }

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    earnings: [recentEarn.period, recentEarn.estimate, recentEarn.actual, recentEarn.surprise, recentEarn.report_date],
    headline: headlineQ ? Object.values(headlineQ) : null,
    drivers:  drivers.map(d => d.name),
    tripwires: tripwires.map(t => t.id),
  }));

  const priorEarn = (priorEarnRes?.results || []).slice(1);  // exclude the most-recent (already in recentEarn)

  const prompt = buildPrompt({ ticker, recentEarn, priorEarn, headlineQ, drivers, tripwires, prevSummary });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob, drivers, tripwires);

  const now = new Date().toISOString();
  const summary = {
    bullets:       blob.bullets,
    bullet_count:  blob.bullets.length,
    surprise_pct:  recentEarn.surprise_pct ?? null,
    report_date:   recentEarn.report_date,
    period:        recentEarn.period,
    version:       prevVersion + 1,
    last_updated:  now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
    earnings_period_at_write: recentEarn.period,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET earnings_summary_json       = ?,
            earnings_summary_updated_at = ?,
            earnings_summary_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(summary), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: summary.version,
    period: summary.period,
    bullet_count: summary.bullet_count,
    earnings_summary_updated_at: now,
  };
}

function buildPrompt({ ticker, recentEarn, priorEarn, headlineQ, drivers, tripwires, prevSummary }) {
  const earnBlock = `  period:       ${recentEarn.period}
  report_date:  ${recentEarn.report_date}
  estimate:     ${fmtNum(recentEarn.estimate)} EPS
  actual:       ${fmtNum(recentEarn.actual)} EPS
  surprise:     ${fmtNum(recentEarn.surprise)}  (${fmtNum(recentEarn.surprise_pct)}%)`;

  const priorBlock = priorEarn.length
    ? priorEarn.map(e => `  ${e.report_date}  est=${fmtNum(e.estimate)}  act=${fmtNum(e.actual)}  surprise=${fmtNum(e.surprise_pct)}%`).join("\n")
    : "  (no prior earnings rows)";

  const headlineBlock = headlineQ
    ? `  fiscal_period_ending: ${headlineQ.fiscal_period_ending}
  total_revenue:        ${fmtMoney(headlineQ.total_revenue)}
  gross_profit:         ${fmtMoney(headlineQ.gross_profit)}
  operating_income:     ${fmtMoney(headlineQ.operating_income)}
  net_income:           ${fmtMoney(headlineQ.net_income)}
  ebitda:               ${fmtMoney(headlineQ.ebitda)}
  capex:                ${fmtMoney(headlineQ.capex)}
  dividends_paid:       ${fmtMoney(headlineQ.dividends_paid)}
  buyback:              ${fmtMoney(headlineQ.buyback)}`
    : "  (no FUND_01_Quarterly row at-or-before report_date)";

  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}`).join("\n")
    : "  (no drivers — tags may all be null)";
  const tripwiresBlock = tripwires.length
    ? tripwires.map(t => `  - [${t.id}] ${t.condition}`).join("\n")
    : "  (no tripwires)";

  const prevBlock = prevSummary
    ? `Period: ${prevSummary.earnings_period_at_write}  (last updated ${prevSummary.last_updated})
Bullets:
${(prevSummary.bullets || []).slice(0, 5).map(b => `  - [${b.angle}] ${b.claim}`).join("\n")}`
    : "(no prior summary)";

  const driverNamesJson = JSON.stringify(drivers.map(d => d.name));
  const tripwireIdsJson = JSON.stringify(tripwires.map(t => t.id));

  return `You are a senior equity analyst writing the earnings summary for ${ticker} for the most recent reported quarter. A complete bullet summary — NOT filtered through the thesis drivers (a complete summary is the point) but each bullet IS tagged when it touches a driver/tripwire.

NOTE: Earnings call transcripts, press releases, MD&A snippets, and decks are NOT YET in DB. Ground bullets in the EPS surprise + the FUND_01_Quarterly headline financials only. Tag the source as "release". Do not invent guidance or transcript quotes.

MOST RECENT EARNINGS
${earnBlock}

PRIOR 3 QUARTERS (for delta context)
${priorBlock}

HEADLINE FINANCIALS (FUND_01_Quarterly at-or-before report_date)
${headlineBlock}

THESIS DRIVERS (valid driver_tag values; bullet may set null)
${driversBlock}

THESIS TRIPWIRES (valid tripwire_tag values; bullet may set null)
${tripwiresBlock}

PREVIOUS SUMMARY (only relevant if it was for an earlier period — for continuity)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "bullets": [
    {
      "angle":        "rev_beat" | "guidance" | "segment" | "margin" | "capex" | "capital_return" | "risks",
      "claim":        "<one short factual sentence with the number / direction>",
      "driver_tag":   "<driver_name from THESIS DRIVERS>" | null,
      "tripwire_tag": "<tripwire id from THESIS TRIPWIRES>" | null,
      "source":       "release" | "transcript" | "deck" | "mda"
    }
  ]
}

RULES
- 4-8 bullets. A complete summary across the angles you have data for.
- "rev_beat" angle MUST appear if surprise data exists — it is the headline.
- driver_tag MUST be one of ${driverNamesJson} OR null. tripwire_tag MUST be one of ${tripwireIdsJson} OR null.
- Until transcripts / decks are in DB, source MUST be "release". Do not fabricate transcript quotes.
- Skip "guidance" / "segment" angles unless you can ground them in the headline financials shown — do NOT make them up.
- Each bullet is ONE short sentence. State the number explicitly.`;
}

function fmtNum(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(2);
  return n.toFixed(4);
}
function fmtMoney(v) {
  if (v == null) return "(NA)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(NA)";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob, drivers, tripwires) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (!Array.isArray(blob.bullets) || blob.bullets.length < 4 || blob.bullets.length > 8) {
    throw new Error(`invalid bullets: must be 4-8, got ${blob.bullets?.length ?? "?"}`);
  }
  const driverNames = new Set(drivers.map(d => d.name));
  const tripwireIds = new Set(tripwires.map(t => t.id));
  let hasRevBeat = false;
  for (const b of blob.bullets) {
    if (!b || typeof b.claim !== "string" || b.claim.trim().length < 10) {
      throw new Error("invalid bullet: claim missing or too short");
    }
    if (!VALID_ANGLES.has(b.angle))   throw new Error(`invalid angle '${b.angle}'`);
    if (!VALID_SOURCES.has(b.source)) throw new Error(`invalid source '${b.source}'`);
    if (b.driver_tag !== null && !driverNames.has(b.driver_tag)) {
      throw new Error(`invalid driver_tag '${b.driver_tag}'`);
    }
    if (b.tripwire_tag !== null && !tripwireIds.has(b.tripwire_tag)) {
      throw new Error(`invalid tripwire_tag '${b.tripwire_tag}'`);
    }
    if (b.angle === "rev_beat") hasRevBeat = true;
  }
  if (!hasRevBeat) throw new Error("invalid output: must include at least one 'rev_beat' angle bullet");
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
