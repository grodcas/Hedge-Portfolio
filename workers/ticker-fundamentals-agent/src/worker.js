/**
 * TICKER-FUNDAMENTALS-AGENT (#2 Fundamentals reading) — per [TICKER_PIPELINE.md §2].
 *
 * One paragraph on whether the operating story is expanding, holding, or
 * contracting on the drivers that matter.
 *
 * Inputs (per ticker):
 *   - Latest FUND_01_Fundamentals (annual snapshot — revenue_annual,
 *     net_income, cfo, total_assets, total_debt, gross_profit,
 *     gross_margin_annual, profit_margin, operating_margin, roa,
 *     current_ratio + their _prev for YoY deltas)
 *   - FUND_01_Quarterly (most recent ~4 quarters if present — for QoQ
 *     trajectory; table is sparsely populated today, missing rows are
 *     marked "(unavailable)" in the prompt)
 *   - Latest STOCK_FACTORS_daily.eps_rev_4w + sue (for the operating-story
 *     external read).
 *   - Prior thesis drivers — operates as the relevance filter.
 *
 * Output (validated):
 *   {
 *     prose: string,
 *     verdict: "expanding" | "holding" | "contracting",
 *     top_3_deltas: [{ metric, value, direction }],   // 3 items
 *     version, last_updated, input_fingerprint, ticker_at_write
 *   }
 *
 * Writes TICKER_TREND_long.{fundamentals_json, _updated_at, _model}.
 * Endpoint: GET /build?ticker=NVDA[&force=1].
 */

import { callLLM } from "../../_shared/llm.js";

const MODEL = "gpt-5";
const VALID_VERDICTS = new Set(["expanding", "holding", "contracting"]);
const VALID_DIRECTIONS = new Set(["up", "flat", "down"]);

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
  const [trendRow, fundRow, quarterly, factorsRow] = await Promise.all([
    db.prepare(
      `SELECT thesis_json, fundamentals_json, fundamentals_updated_at
         FROM TICKER_TREND_long WHERE ticker = ?`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT date, revenue_annual, revenue_annual_prev, net_income, net_income_prev,
              gross_profit, gross_profit_prev, gross_margin_annual, gross_margin_annual_prev,
              profit_margin, operating_margin, cfo, cfo_prev,
              total_assets, total_assets_prev, total_debt, total_debt_prev,
              roa, roa_prev, current_ratio, current_ratio_prev,
              shares_outstanding, shares_outstanding_prev
         FROM FUND_01_Fundamentals WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
    db.prepare(
      `SELECT fiscal_period_ending, total_revenue, gross_profit, operating_income,
              net_income, ebitda, total_assets, total_liabilities, cfo, capex
         FROM FUND_01_Quarterly WHERE ticker = ?
        ORDER BY fiscal_period_ending DESC LIMIT 4`,
    ).bind(ticker).all(),
    db.prepare(
      `SELECT date, eps_rev_4w, sue, rev_breadth_4w
         FROM STOCK_FACTORS_daily WHERE ticker = ?
        ORDER BY date DESC LIMIT 1`,
    ).bind(ticker).first(),
  ]);
  if (!trendRow) throw new Error(`no TICKER_TREND_long row for ${ticker}`);
  if (!fundRow && !(quarterly?.results?.length)) {
    throw new Error(`no fundamentals data for ${ticker}`);
  }
  const quarters = quarterly?.results || [];

  const thesis  = trendRow.thesis_json ? safeJson(trendRow.thesis_json) : null;
  const drivers = Array.isArray(thesis?.drivers) ? thesis.drivers : [];

  const prevFund   = trendRow.fundamentals_json ? safeJson(trendRow.fundamentals_json) : null;
  const prevVersion = Number.isInteger(prevFund?.version) ? prevFund.version : 0;

  const fingerprint = await sha256(JSON.stringify({
    ticker,
    fund: fundRow ? Object.values(fundRow) : null,
    quarters: quarters.map(q => Object.values(q)),
    factors: factorsRow ? [factorsRow.eps_rev_4w, factorsRow.sue, factorsRow.rev_breadth_4w] : null,
    drivers: drivers.map(d => d.name),
  }));

  if (!force && prevFund?.input_fingerprint === fingerprint) {
    return {
      action: "noop",
      reason: "input_fingerprint unchanged",
      ticker,
      version: prevVersion,
      fundamentals_updated_at: trendRow.fundamentals_updated_at,
    };
  }

  const prompt = buildPrompt({ ticker, fundRow, quarters, factorsRow, drivers, prevFund });
  const blob = await callLLM(apiKey, prompt, { model: MODEL });
  validate(blob);

  const now = new Date().toISOString();
  const fundamentals = {
    prose:        blob.prose.trim(),
    verdict:      blob.verdict,
    top_3_deltas: blob.top_3_deltas,
    version:      prevVersion + 1,
    last_updated: now,
    input_fingerprint: fingerprint,
    ticker_at_write: ticker,
  };

  await db.prepare(
    `UPDATE TICKER_TREND_long
        SET fundamentals_json       = ?,
            fundamentals_updated_at = ?,
            fundamentals_model      = ?
      WHERE ticker = ?`,
  ).bind(JSON.stringify(fundamentals), now, MODEL, ticker).run();

  return {
    action: "wrote",
    ticker,
    version: fundamentals.version,
    verdict: fundamentals.verdict,
    deltas:  fundamentals.top_3_deltas.length,
    fundamentals_updated_at: now,
  };
}

function buildPrompt({ ticker, fundRow, quarters, factorsRow, drivers, prevFund }) {
  const fundBlock = fundRow
    ? `  date:                  ${fundRow.date}
  revenue_annual:        ${fmtMoney(fundRow.revenue_annual)}   (prev ${fmtMoney(fundRow.revenue_annual_prev)})
  net_income:            ${fmtMoney(fundRow.net_income)}       (prev ${fmtMoney(fundRow.net_income_prev)})
  gross_profit:          ${fmtMoney(fundRow.gross_profit)}     (prev ${fmtMoney(fundRow.gross_profit_prev)})
  gross_margin_annual:   ${fmtPct(fundRow.gross_margin_annual)} (prev ${fmtPct(fundRow.gross_margin_annual_prev)})
  profit_margin:         ${fmtPct(fundRow.profit_margin)}
  operating_margin:      ${fmtPct(fundRow.operating_margin)}
  cfo:                   ${fmtMoney(fundRow.cfo)}              (prev ${fmtMoney(fundRow.cfo_prev)})
  total_assets:          ${fmtMoney(fundRow.total_assets)}     (prev ${fmtMoney(fundRow.total_assets_prev)})
  total_debt:            ${fmtMoney(fundRow.total_debt)}       (prev ${fmtMoney(fundRow.total_debt_prev)})
  roa:                   ${fmtPct(fundRow.roa)}                (prev ${fmtPct(fundRow.roa_prev)})
  current_ratio:         ${fmtNum(fundRow.current_ratio)}      (prev ${fmtNum(fundRow.current_ratio_prev)})
  shares_outstanding:    ${fmtMoney(fundRow.shares_outstanding)} (prev ${fmtMoney(fundRow.shares_outstanding_prev)})`
    : "  (no FUND_01_Fundamentals row)";

  const quartersBlock = quarters.length
    ? quarters.map(q =>
        `  ${q.fiscal_period_ending}  rev=${fmtMoney(q.total_revenue)}  op_inc=${fmtMoney(q.operating_income)}  net=${fmtMoney(q.net_income)}  ebitda=${fmtMoney(q.ebitda)}  cfo=${fmtMoney(q.cfo)}  capex=${fmtMoney(q.capex)}`,
      ).join("\n")
    : "  (FUND_01_Quarterly is empty for this ticker — no QoQ trajectory)";

  const factorsBlock = factorsRow
    ? `  date:           ${factorsRow.date}
  eps_rev_4w:     ${fmtNum(factorsRow.eps_rev_4w)}      (sell-side EPS revisions, 4w)
  rev_breadth_4w: ${fmtNum(factorsRow.rev_breadth_4w)}  (revisions breadth)
  sue:            ${fmtNum(factorsRow.sue)}             (last earnings surprise σ)`
    : "  (no STOCK_FACTORS_daily row)";

  const driversBlock = drivers.length
    ? drivers.map(d => `  - ${d.name}: ${d.rationale}`).join("\n")
    : "  (no prior thesis — call this first version; pick general operating drivers)";

  const prevBlock = prevFund
    ? `Version: ${prevFund.version} (last updated ${prevFund.last_updated})
Verdict: ${prevFund.verdict}
Top deltas: ${(prevFund.top_3_deltas || []).map(d => `${d.metric} ${d.direction}`).join(", ") || "(none)"}
Prose: ${prevFund.prose}`
    : "(no prior fundamentals reading)";

  return `You are a senior equity analyst writing the fundamentals reading for ${ticker}. One short paragraph on whether the operating story is EXPANDING, HOLDING, or CONTRACTING on the drivers that matter, plus the three most material YoY deltas.

PRIOR THESIS DRIVERS (the operating story to read against)
${driversBlock}

ANNUAL SNAPSHOT (FUND_01_Fundamentals — current vs prior year)
${fundBlock}

QUARTERLY TRAJECTORY (FUND_01_Quarterly — most recent quarters first)
${quartersBlock}

EXTERNAL CONFIRMATION (STOCK_FACTORS_daily)
${factorsBlock}

PREVIOUS FUNDAMENTALS READING (drift gradually — only flip verdict when data demands)
${prevBlock}

TASK
Output EXACTLY this JSON (no surrounding prose, no markdown fences):

{
  "prose": "<one short paragraph, 3-5 sentences. Reference SPECIFIC YoY or QoQ deltas with the actual values. Tie back to the named drivers.>",
  "verdict": "expanding" | "holding" | "contracting",
  "top_3_deltas": [
    {
      "metric":    "<name as it appears above, e.g. 'revenue_annual', 'cfo', 'operating_margin'>",
      "value":     "<short string with the magnitude, e.g. '+78% YoY', '+540bps', '$36.2B vs $16.6B'>",
      "direction": "up" | "flat" | "down"
    }
  ]
}

RULES
- top_3_deltas MUST contain exactly 3 items. Pick the deltas that most touch the named drivers — not the largest in absolute terms.
- Every delta cited must come from the snapshot above. Do NOT invent numbers; do NOT cite a field marked "(unavailable)".
- "expanding" requires ≥2 deltas in the up direction on driver-aligned metrics. "contracting" requires ≥2 down. Otherwise "holding".
- If FUND_01_Quarterly is empty, base the verdict on the YoY annual snapshot alone — do not fabricate quarters.
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

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function validate(blob) {
  if (!blob || typeof blob !== "object") throw new Error("invalid output: not an object");
  if (typeof blob.prose !== "string" || blob.prose.trim().length < 50) {
    throw new Error("invalid output: prose missing or too short");
  }
  if (!VALID_VERDICTS.has(blob.verdict)) {
    throw new Error(`invalid verdict: ${blob.verdict}`);
  }
  if (!Array.isArray(blob.top_3_deltas) || blob.top_3_deltas.length !== 3) {
    throw new Error(`invalid top_3_deltas: must be exactly 3, got ${blob.top_3_deltas?.length ?? "?"}`);
  }
  for (const d of blob.top_3_deltas) {
    if (!d || typeof d.metric !== "string" || !d.metric.trim()) {
      throw new Error("invalid delta: metric missing");
    }
    if (typeof d.value !== "string" || !d.value.trim()) {
      throw new Error("invalid delta: value missing");
    }
    if (!VALID_DIRECTIONS.has(d.direction)) {
      throw new Error(`invalid delta direction: ${d.direction}`);
    }
  }
}

async function sha256(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
