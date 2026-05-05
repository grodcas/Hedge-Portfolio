/**
 * CONSENSUS-FETCHER — daily writer for FUND_03_Estimates.
 *
 * Per tracked ticker (sourced from PEER_SET_config), pulls FY / FY+1 / FY+2
 * sell-side consensus and upserts to FUND_03_Estimates. Drives Ticker
 * agent #3 (Estimates reading).
 *
 * Source: FMP `stable/analyst-estimates` (free tier).
 *   The runbook called for Finnhub /stock/eps-estimate but that endpoint is
 *   premium-only on Finnhub's free tier (HTTP 403). FMP's stable endpoint
 *   returns the same epsAvg / epsHigh / epsLow / revenueAvg shape on the
 *   free key already in .env, with no tier upgrade needed.
 *
 * Endpoints:
 *   GET /build  — pull + upsert. Returns {ok, tickers, inserted, errors}.
 *   GET /status — count + latest fiscal_year per ticker.
 *
 * Cron: 13:00 UTC daily.
 *
 * Notes on coverage:
 *   - eps_consensus, rev_consensus            → epsAvg / revenueAvg
 *   - eps_dispersion                          → (epsHigh − epsLow) as a range
 *                                               proxy; not a true stdev (no
 *                                               per-analyst estimates exposed).
 *   - eps_revisions_30d, rev_revisions_30d    → not available on either FMP
 *                                               or Finnhub free; NULL for now.
 *   Agents reading FUND_03_Estimates should treat NULL revision counts as
 *   "revision data not yet wired" rather than "no revisions occurred".
 */

const FMP_BASE = "https://financialmodelingprep.com/stable";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/build")  return Response.json(await build(env));
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(build(env).catch((e) => console.error(`[consensus] cron: ${e.message}`)));
  },
};

async function build(env) {
  const apiKey = env.FMP_KEY;
  if (!apiKey) throw new Error("FMP_KEY secret not set");

  // Source of truth for tracked tickers — bootstrapped in MS-1c. Avoids
  // hardcoding the ticker list in yet another worker.
  const { results: peerRows } = await env.DB.prepare(
    `SELECT ticker FROM PEER_SET_config ORDER BY ticker`,
  ).all();
  const tickers = (peerRows || []).map((r) => r.ticker);
  if (tickers.length === 0) {
    return { ok: false, error: "PEER_SET_config is empty — run scripts/bootstrap-peer-set-config.js first" };
  }

  const thisYear = new Date().getUTCFullYear();
  const targetYears = [thisYear, thisYear + 1, thisYear + 2]; // FY / FY+1 / FY+2

  let inserted = 0;
  const errors = [];

  // FMP free tier allows ~250 req/day; 25 tickers fits cleanly.
  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
      const rows = await fetchFmpEstimates(apiKey, symbol, ticker);
      const byYear = indexByYear(rows);

      for (const year of targetYears) {
        const r = byYear.get(year);
        if (!r) continue;

        const periodLabel = `FY${year}`;
        const id = await shortHash(`${ticker}|annual|${periodLabel}`);
        const dispersion =
          r.epsHigh != null && r.epsLow != null ? r.epsHigh - r.epsLow : null;

        await env.DB.prepare(
          `INSERT INTO FUND_03_Estimates
             (id, ticker, period_label, period_kind, fiscal_year,
              eps_consensus, rev_consensus,
              eps_revisions_30d, rev_revisions_30d, eps_dispersion, source)
           VALUES (?, ?, ?, 'annual', ?, ?, ?, ?, ?, ?, 'fmp')
           ON CONFLICT(id) DO UPDATE SET
             eps_consensus      = excluded.eps_consensus,
             rev_consensus      = excluded.rev_consensus,
             eps_revisions_30d  = excluded.eps_revisions_30d,
             rev_revisions_30d  = excluded.rev_revisions_30d,
             eps_dispersion     = excluded.eps_dispersion,
             source             = excluded.source`,
        )
          .bind(
            id,
            ticker,
            periodLabel,
            year,
            r.epsAvg ?? null,
            r.revenueAvg ?? null,
            null,         // eps_revisions_30d — not available on free tier
            null,         // rev_revisions_30d — not available on free tier
            dispersion,   // (epsHigh − epsLow) range proxy, not a true stdev
          )
          .run();
        inserted++;
      }
    }),
  );

  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "rejected") {
      errors.push(`${tickers[i]}: ${settled[i].reason?.message || "unknown"}`);
    }
  }

  return { ok: true, tickers: tickers.length, inserted, errors };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            COUNT(DISTINCT ticker) AS tickers,
            MIN(fiscal_year) AS min_year,
            MAX(fiscal_year) AS max_year
       FROM FUND_03_Estimates`,
  ).first();
  return { ok: true, ...summary };
}

async function fetchFmpEstimates(apiKey, symbol, ticker) {
  const url = `${FMP_BASE}/analyst-estimates?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP ${ticker} → HTTP ${res.status}`);
  const j = await res.json();
  // FMP returns either an array on success or {Error Message} on failure.
  if (!Array.isArray(j)) {
    throw new Error(`FMP ${ticker}: ${j?.["Error Message"] || "unexpected response"}`);
  }
  return j;
}

function indexByYear(rows) {
  // FMP returns each row keyed by `date` (YYYY-MM-DD, fiscal-period end).
  // We treat the date's year as the fiscal year. Works for both calendar-year
  // filers (Dec end) and off-cycle filers (e.g. AAPL: late Sept).
  const map = new Map();
  for (const r of rows) {
    const y = r.date ? parseInt(String(r.date).slice(0, 4), 10) : null;
    if (Number.isFinite(y)) map.set(y, r);
  }
  return map;
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
