/**
 * TICKER-VALUATION-AGENT (#1 Valuation reading) — per [TICKER_PIPELINE.md §1].
 *
 * Reads the ticker's valuation snapshot in light of the prior thesis drivers
 * and lands on a verdict (cheap / fair / rich, against what).
 *
 * Inputs (per ticker):
 *   - Latest STOCK_FACTORS_daily        (fwd_pe, rel_pe_sigma vs sector,
 *                                        peer_median_pe, mom_12_1, sue,
 *                                        rs_vs_sector_3m)
 *   - Latest FUND_01_Fundamentals       (pe_ratio, forward_pe, market_cap,
 *                                        dividend_yield, beta, profit_margin,
 *                                        operating_margin, cfo, revenue_annual)
 *   - SECTOR_FACTORS_daily.fwd_pe_sector  (sector forward PE for context)
 *   - Prior thesis drivers (TICKER_TREND_long.thesis_json) — so the verdict
 *     is read against the actual story, not in a vacuum.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "cheap" | "fair" | "rich",
 *     vs_what: "own_history" | "sector" | "growth_profile",
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{valuation_json, _updated_at, _model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_VERDICTS = new Set(["cheap", "fair", "rich"]);
const VALID_VS_WHAT  = new Set(["own_history", "sector", "growth_profile"]);

// Same canonical sector map used across the agent fleet (operations-agent /
// macro-positioning-agent / sector-factor-builder).
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

  const [trendRow, factorsRow, fundRow, sectorRow] = await Promise.all([
    db.prepare(
      `SELECT ticker, thesis_json, valuation_json, valuation_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT date, fwd_pe, rel_pe_sigma, eps_rev_4w, sue, mom_12_1,
              rs_vs_sector_3m, peer_median_pe
         FROM STOCK_FACTORS_daily WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT date, pe_ratio, forward_pe, market_cap, dividend_yield, beta,
              profit_margin, operating_margin, revenue_annual, cfo
         FROM FUND_01_Fundamentals WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
    sector
      ? db.prepare(
          `SELECT date, fwd_pe_sector, valuation_sigma
             FROM SECTOR_FACTORS_daily WHERE sector = ?
            ORDER BY date DESC LIMIT 1`,
        ).bind(sector).first()
      : Promise.resolve(null),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!factorsRow && !fundRow) {
    throw new Error(`no STOCK_FACTORS_daily nor FUND_01_Fundamentals row for ${ticker}`);
  }

  const thesis = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const drivers = Array.isArray(thesis?.drivers) ? thesis.drivers : [];

  const prevValuation = trendRow.valuation_json ? safeJson(trendRow.valuation_json) : null;
  const prevVersion = Number.isInteger(prevValuation?.version) ? prevValuation.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    factors: factorsRow ? [
      factorsRow.fwd_pe, factorsRow.rel_pe_sigma, factorsRow.peer_median_pe,
      factorsRow.mom_12_1, factorsRow.sue, factorsRow.rs_vs_sector_3m,
    ] : null,
    fund: fundRow ? [
      fundRow.pe_ratio, fundRow.forward_pe, fundRow.market_cap,
      fundRow.dividend_yield, fundRow.beta, fundRow.profit_margin,
      fundRow.operating_margin, fundRow.revenue_annual, fundRow.cfo,
    ] : null,
    sector_pe: sectorRow ? [sectorRow.fwd_pe_sector, sectorRow.valuation_sigma] : null,
    drivers: drivers.map(d => d.name),
  }));

  if (!force && prevValuation?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      valuation_updated_at: trendRow.valuation_updated_at,
    };
  }

  const prompt = buildPrompt({ ticker, sector, factorsRow, fundRow, sectorRow, drivers, prevValuation });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob);

  const now = new Date().toISOString();
  const valuation = {
    prose:        blob.prose.trim(),
    verdict:      blob.verdict,
    vs_what:      blob.vs_what,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET valuation_json       = ?,
            valuation_updated_at = ?,
            valuation_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(valuation), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: valuation.version,
    verdict: valuation.verdict,
    vs_what: valuation.vs_what,
    valuation_updated_at: now,
  };
}

function buildPrompt({ ticker, sector, factorsRow, fundRow, sectorRow, drivers, prevValuation }) {
  const factorsBlock = factorsRow
    ? `  date:               ${factorsRow.date}
  fwd_pe:             ${fmtNum(factorsRow.fwd_pe)}
  rel_pe_sigma:       ${fmtNum(factorsRow.rel_pe_sigma)}σ   (vs sector trend)
  peer_median_pe:     ${fmtNum(factorsRow.peer_median_pe)}
  mom_12_1:           ${fmtNum(factorsRow.mom_12_1)}
  sue:                ${fmtNum(factorsRow.sue)}
  rs_vs_sector_3m:    ${fmtNum(factorsRow.rs_vs_sector_3m)}`
    : "  (no STOCK_FACTORS_daily row)";

  const fundBlock = fundRow
    ? `  date:                ${fundRow.date}
  pe_ratio (trailing): ${fmtNum(fundRow.pe_ratio)}
  forward_pe:          ${fmtNum(fundRow.forward_pe)}
  market_cap:          ${fmtMoney(fundRow.market_cap)}
  dividend_yield:      ${fmtDividendYield(fundRow.dividend_yield)}
  beta:                ${fmtNum(fundRow.beta)}
  profit_margin:       ${fmtPct(fundRow.profit_margin)}
  operating_margin:    ${fmtPct(fundRow.operating_margin)}
  revenue_annual:      ${fmtMoney(fundRow.revenue_annual)}
  cfo:                 ${fmtMoney(fundRow.cfo)}`
    : "  (no FUND_01_Fundamentals row)";

  const sectorBlock = sectorRow
    ? `  fwd_pe_sector:    ${fmtNum(sectorRow.fwd_pe_sector)}
  valuation_sigma:  ${fmtNum(sectorRow.valuation_sigma)}σ`
    : "  (no SECTOR_FACTORS_daily row)";

  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no prior thesis — call this first version)";

  const prevBlock = prevValuation
    ? `Version: ${prevValuation.version} (last updated ${prevValuation.last_updated})
Verdict: ${prevValuation.verdict} (vs ${prevValuation.vs_what})
Prose: ${prevValuation.prose}`
    : "(no prior valuation reading)";

  return `You are a senior equity analyst writing the valuation reading for ${ticker} (sector: ${sector || "unknown"}). One short paragraph that reads the snapshot in light of the thesis drivers, then lands on a verdict (cheap / fair / rich) and what the comparison is against (own_history / sector / growth_profile).

PRIOR THESIS DRIVERS (read valuation against THIS story, not in a vacuum)
${driversBlock}

STOCK_FACTORS_daily (latest)
${factorsBlock}

FUND_01_Fundamentals (latest annual snapshot)
${fundBlock}

SECTOR CONTEXT (${sector || "n/a"})
${sectorBlock}

PREVIOUS VALUATION READING (drift gradually — only flip verdict when data demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Reference SPECIFIC values from the snapshot. State whether the multiple is justified given the drivers.>",
  "verdict": "cheap" | "fair" | "rich",
  "vs_what": "own_history" | "sector" | "growth_profile"
}

RULES
- Reference at least two specific numbers from the snapshot above. Do NOT invent numbers; do NOT cite a field marked "(no row)".
- The verdict must be defensible against ONE comparator (vs_what). Pick the comparator that best fits the available data.
- If the thesis has a "growth" or "AI" driver, weigh growth_profile heavier than headline P/E.
- "rich" requires either a forward P/E materially above sector AND no growth driver, OR rel_pe_sigma > +1.0 with stalling momentum.
- "cheap" requires either a forward P/E below sector with intact drivers, OR rel_pe_sigma < -1.0 with positive eps_rev.
- Do not hedge — pick one verdict.`;
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
function fmtPct(v) {
  if (v == null) return "(unavailable)";
  const n = Number(v);
  if (!Number.isFinite(n)) return "(unavailable)";
  return `${(n * 100).toFixed(2)}%`;
}

// FUND_01_Fundamentals.dividend_yield ships in mixed formats depending
// on which writer landed the row: AV's DividendYield is a decimal (0.0002 = 0.02%),
// while Finnhub's currentDividendYieldTTM (used by migration 0035 backfill
// from raw_json) is already-in-percent units (0.0201 = 0.0201%, not 2.01%).
// The two ranges overlap below 0.10, so we can't reliably distinguish at
// read time. Until the source is normalized at ingest (TODO), suppress
// the field rather than risk a 100× error like NVDA's "2.01% dividend"
// (real yield 0.02%). The valuation agent uses dividend_yield as a minor
// quality signal — losing it doesn't change verdicts.
function fmtDividendYield(_v) {
  return "(omitted — source format ambiguous; see fmtDividendYield in src/worker.js)";
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict)) {
    throw new Error(`invalid verdict: ${blob.verdict}`);
  }
  if (!VALID_VS_WHAT.has(blob.vs_what)) {
    throw new Error(`invalid vs_what: ${blob.vs_what}`);
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
