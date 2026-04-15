/**
 * TICKER-TREND-LONG
 *
 * Builds the slow, long-term trend baseline per ticker by reading the 4 latest
 * 10-K/10-Q filings from ALPHA_01_Reports + 4 latest quarterly earnings from
 * FUND_02_Earnings, then calling gpt-5 to synthesize a structured trend blob.
 *
 * Endpoints:
 *   GET  /build?ticker=AAPL            — build for one ticker
 *   GET  /build-all                    — loop all tracked tickers
 *
 * Writes to TICKER_TREND_long (one row per ticker, upsert).
 * Consumed by: dashboard per-ticker row, ticker-trend-short (as its baseline),
 * operations agent (sector clustering context).
 */

const TRACKED_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "MS", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX",
];

const SECTOR_MAP = {
  Technology: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "INTC", "AMD", "NFLX", "TSLA"],
  Finance: ["JPM", "GS", "BAC", "MS", "BRK.B"],
  Energy: ["XOM", "CVX"],
  Healthcare: ["UNH", "LLY", "JNJ"],
  Consumer: ["PG", "KO", "HD"],
  Industrial: ["CAT", "BA"],
};
const TICKER_SECTOR = Object.fromEntries(
  Object.entries(SECTOR_MAP).flatMap(([s, ts]) => ts.map((t) => [t, s])),
);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });

    if (url.pathname === "/build") {
      const ticker = url.searchParams.get("ticker");
      if (!ticker) return Response.json({ ok: false, error: "ticker required" }, { status: 400 });
      try {
        const out = await buildForTicker(env.DB, apiKey, ticker);
        return Response.json({ ok: true, ...out });
      } catch (e) {
        return Response.json({ ok: false, ticker, error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/build-all") {
      const results = [];
      for (const ticker of TRACKED_TICKERS) {
        try {
          const out = await buildForTicker(env.DB, apiKey, ticker);
          results.push({ ticker, ok: true, regime: out.regime, score: out.score });
          console.log(`[trend-long] ${ticker} regime=${out.regime} score=${out.score}`);
        } catch (e) {
          console.error(`[trend-long] ${ticker} FAILED: ${e.message}`);
          results.push({ ticker, ok: false, error: e.message });
        }
      }
      return Response.json({ ok: true, count: results.length, results });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function buildForTicker(db, apiKey, ticker) {
  const [reportsRes, earningsRes, fundRes] = await Promise.all([
    db
      .prepare(
        `SELECT date, type, summary FROM ALPHA_01_Reports
          WHERE ticker = ? AND (type = '10-K' OR type = '10-Q')
            AND summary IS NOT NULL AND LENGTH(summary) > 100
          ORDER BY date DESC LIMIT 4`,
      )
      .bind(ticker)
      .all(),
    db
      .prepare(
        `SELECT period, estimate, actual, surprise, surprise_pct, report_date
           FROM FUND_02_Earnings
          WHERE ticker = ?
          ORDER BY report_date DESC LIMIT 4`,
      )
      .bind(ticker)
      .all(),
    db
      .prepare(
        `SELECT pe_ratio, forward_pe, eps, revenue_ttm, profit_margin, operating_margin,
                market_cap, week_52_high, week_52_low, dma_50, dma_200, analyst_target,
                dividend_yield, beta
           FROM FUND_01_Fundamentals WHERE ticker = ? LIMIT 1`,
      )
      .bind(ticker)
      .first(),
  ]);
  const reports = (reportsRes.results || []).slice().reverse(); // chronological
  const earnings = (earningsRes.results || []).slice().reverse();
  const fund = fundRes || null;

  if (reports.length === 0 && earnings.length === 0 && !fund) {
    throw new Error("no report, earnings, or fundamentals data");
  }

  const sector = TICKER_SECTOR[ticker] || "Unknown";

  const reportsBlock =
    reports.length === 0
      ? "  (no 10-K/10-Q filings available)"
      : reports
          .map(
            (r) =>
              `  ${r.date} — ${r.type}\n    ${(r.summary || "").slice(0, 2000)}`,
          )
          .join("\n\n");

  const earningsBlock =
    earnings.length === 0
      ? "  (no earnings history available)"
      : earnings
          .map((e) => {
            const beat =
              e.surprise_pct == null
                ? "?"
                : e.surprise_pct > 2
                  ? "BEAT"
                  : e.surprise_pct < -2
                    ? "MISS"
                    : "MEET";
            return `  ${e.report_date} (period ${e.period}): est=${e.estimate ?? "?"}  actual=${e.actual ?? "?"}  surprise=${e.surprise_pct ?? "?"}%  [${beat}]`;
          })
          .join("\n");

  const fundBlock = fund
    ? [
        `  PE: ${fmt(fund.pe_ratio)}   Forward PE: ${fmt(fund.forward_pe)}   EPS: ${fmt(fund.eps)}`,
        `  Revenue TTM: ${fmtB(fund.revenue_ttm)}   Market cap: ${fmtB(fund.market_cap)}`,
        `  Profit margin: ${fmtPct(fund.profit_margin)}   Operating margin: ${fmtPct(fund.operating_margin)}`,
        `  52w range: ${fmt(fund.week_52_low)} .. ${fmt(fund.week_52_high)}`,
        `  50-DMA: ${fmt(fund.dma_50)}   200-DMA: ${fmt(fund.dma_200)}   Analyst target: ${fmt(fund.analyst_target)}`,
        `  Dividend yield: ${fmtPct(fund.dividend_yield)}   Beta: ${fmt(fund.beta)}`,
      ].join("\n")
    : "  (no fundamentals available)";

  const prompt = `You are a senior equity analyst. Build a long-term trend for ${ticker} (${sector}) from its 4 latest SEC filings, 4 latest quarterly earnings, and current fundamentals. This trend is the SLOW baseline — it changes only when new reports or earnings land, not when daily news moves the stock.

FILINGS (chronological, may be sparse)
${reportsBlock}

EARNINGS HISTORY (most recent last)
${earningsBlock}

FUNDAMENTALS (latest snapshot)
${fundBlock}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:

{
  "regime":   "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "score":    -1.0 to 1.0,
  "thesis":   "one sentence capturing the fundamental story",
  "drivers":  [{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}],
  "narrative":[{"text": "short bullet", "bias": "bull" | "bear" | "neutral"}]
}

RULES
- regime = long-horizon conviction, based on fundamentals + earnings trajectory (NOT recent price action)
- score aligns with regime: bullish > 0.4, cautious_bullish 0.1..0.4, neutral -0.1..0.1, cautious_bearish -0.4..-0.1, bearish < -0.4
- drivers: 3-5 items, sorted by importance, each < 20 words, grounded in the filings/earnings above
- narrative: 3-5 items, telling the trajectory story (how the thesis evolved across the 4 periods)
- bias: "bull" = supports upside, "bear" = supports downside, "neutral" = two-sided
- Do NOT reference daily news or current price — this is a fundamentals-only view
- If data is sparse, pick "neutral" and say so in thesis
- Relative valuation vs sector is legitimate context (e.g., PE > sector average = pressure on multiple)
- Price vs 50/200 DMA is a technical context you may reference only if confirmed by fundamentals`;

  const blob = await callGPT5(apiKey, prompt);
  if (!blob?.regime) throw new Error("invalid LLM output");

  const asOf = new Date().toISOString().slice(0, 10);
  const lastFiling = reports[reports.length - 1];
  const lastEarning = earnings[earnings.length - 1];
  const updatedBy = lastFiling
    ? `filing:${lastFiling.date}:${lastFiling.type}`
    : lastEarning
      ? `earnings:${lastEarning.report_date}`
      : "bootstrap";

  await db
    .prepare(
      `INSERT INTO TICKER_TREND_long
         (ticker, as_of, updated_by, regime, score, thesis, drivers, narrative, raw_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET
         as_of = excluded.as_of,
         updated_by = excluded.updated_by,
         regime = excluded.regime,
         score = excluded.score,
         thesis = excluded.thesis,
         drivers = excluded.drivers,
         narrative = excluded.narrative,
         raw_blob = excluded.raw_blob`,
    )
    .bind(
      ticker,
      asOf,
      updatedBy,
      blob.regime,
      Number(blob.score) || 0,
      blob.thesis || "",
      JSON.stringify(blob.drivers || []),
      JSON.stringify(blob.narrative || []),
      JSON.stringify(blob),
    )
    .run();

  return {
    ticker,
    regime: blob.regime,
    score: blob.score,
    thesis: blob.thesis,
    reports_used: reports.length,
    earnings_used: earnings.length,
  };
}

function fmt(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return n.toFixed(2);
}
function fmtB(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toFixed(0);
}
function fmtPct(v) {
  if (v == null) return "?";
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return (n * 100).toFixed(1) + "%";
}

async function callGPT5(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "gpt-5 error");
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty gpt-5 output");
  return JSON.parse(text);
}
