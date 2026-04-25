/**
 * STOCK FACTOR BUILDER — Industry-standard equity factors, pure math.
 *
 * Computes 9 daily factors per ticker and writes to STOCK_FACTORS_daily:
 *   1. fwd_pe              FUND_01.forward_pe
 *   2. rel_pe_sigma        (fwd_pe − in-sector-portfolio median) / σ
 *   3. eps_rev_4w          Δ bullish-rec ratio over ~20 trading days (FUND_03 proxy)
 *   4. rev_breadth_4w      Δ (bullish − bearish) ratio over ~20 trading days (FUND_03)
 *   5. sue                 FUND_02.surprise / σ(last 8 surprises)
 *   6. mom_12_1            Jegadeesh-Titman: price[t-21] / price[t-252] − 1
 *   7. rs_vs_sector_3m     ticker 63d return − sector ETF 63d return (SPY fallback)
 *   8. piotroski_f         sum of 9 binary signals from FUND_01 feedstock
 *   9. days_to_catalyst    91 − (days since last earnings report); clamped to [0, 180]
 *
 * No LLM. Deterministic. Reads PRICE_01_Daily, FUND_01_Fundamentals,
 * FUND_02_Earnings, FUND_03_Recommendations. POSTs to portfolio-ingestor
 * /ingest/stock-factors.
 *
 * Runs once daily at wave 1500 via job-engine-workflow.
 */

import PEERS from "../../../config/peers-mapping.json";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

// 25-ticker portfolio → internal sector bucket → SPDR sector ETF proxy.
// Buckets chosen to keep per-sector n ≥ 2 for in-sector median stats.
// New-ETF tickers (XLY, XLC, XLB, XLU, XLRE) won't have 63d history until
// price-fetcher has run for ~90 days; rs_vs_sector_3m falls back to SPY.
// Ticker → sector per SPDR/GICS ETF convention (post-2018 reclass).
// GOOGL and META live in XLC (Communication Services), not XLK.
const SECTOR_BUCKET = {
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology",
  INTC: "Technology", AMD: "Technology",
  AMZN: "ConsDisc", TSLA: "ConsDisc", HD: "ConsDisc",
  GOOGL: "Communication", META: "Communication", NFLX: "Communication",
  JPM: "Finance", GS: "Finance", BAC: "Finance", MS: "Finance", "BRK.B": "Finance",
  XOM: "Energy", CVX: "Energy",
  UNH: "Healthcare", LLY: "Healthcare", JNJ: "Healthcare",
  PG: "Staples", KO: "Staples",
  CAT: "Industrial", BA: "Industrial",
};

const SECTOR_ETF = {
  Technology: "XLK",
  ConsDisc: "XLY",
  Communication: "XLC",
  Finance: "XLF",
  Energy: "XLE",
  Healthcare: "XLV",
  Staples: "XLP",
  Industrial: "XLI",
};

// Worker-to-worker fetch over the public URL hits Cloudflare error 1042
// (loop detection). Writes go straight to D1 via the shared binding.

// Matches portfolio-ingestor's shortHash (full 64-char SHA-256 hex) so both
// paths produce identical IDs for the same ticker|date — upserts stay consistent.
async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/compute-factors")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    console.log(`[STOCK-FACTOR] Starting for ${TICKERS.length} tickers (${today})`);

    // ---------- SHORT INTEREST (best-effort Yahoo) ----------
    // Yahoo may block Cloudflare worker egress. Any failure → null for that
    // ticker; never blocks the daily build.
    const shortByTicker = {};
    try {
      const symbolList = TICKERS.map(t => t === "BRK.B" ? "BRK-B" : t).join(",");
      const yUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolList}&fields=sharesShort,floatShares`;
      const yRes = await fetch(yUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HedgePortfolio/1.0)" },
      });
      if (yRes.ok) {
        const data = await yRes.json();
        const results = data?.quoteResponse?.result || [];
        for (const r of results) {
          const ticker = r.symbol === "BRK-B" ? "BRK.B" : r.symbol;
          if (r.sharesShort != null && r.floatShares && r.floatShares > 0) {
            shortByTicker[ticker] = (r.sharesShort / r.floatShares) * 100;
          }
        }
        console.log(`[STOCK-FACTOR] Yahoo short-interest: ${Object.keys(shortByTicker).length}/${TICKERS.length} tickers`);
      } else {
        console.warn(`[STOCK-FACTOR] Yahoo returned ${yRes.status}; short_pct_float stays null`);
      }
    } catch (err) {
      console.warn(`[STOCK-FACTOR] Yahoo fetch failed: ${err.message}; short_pct_float stays null`);
    }

    // ---------- LOAD INPUTS ----------
    // Prices: 300 days covers 252 + 21 momentum window. Includes sector ETFs + SPY.
    const [priceRows, fundRows, earningsRows, recsRows] = await Promise.all([
      db.prepare(`SELECT ticker, date, close FROM PRICE_01_Daily WHERE date >= date('now', '-400 days') ORDER BY ticker, date`).all(),
      db.prepare(`SELECT f.* FROM FUND_01_Fundamentals f INNER JOIN (SELECT ticker, MAX(date) as md FROM FUND_01_Fundamentals GROUP BY ticker) g ON f.ticker=g.ticker AND f.date=g.md`).all(),
      // Last 8 quarters per ticker for SUE volatility estimate
      db.prepare(`SELECT ticker, period, estimate, actual, surprise, surprise_pct, report_date FROM FUND_02_Earnings ORDER BY ticker, period DESC`).all(),
      // Finnhub rec buckets are monthly (period=YYYY-MM-01). 75 days
      // guarantees we capture the latest + at least one prior bucket
      // for the 4-week delta computation.
      db.prepare(`SELECT ticker, date, strong_buy, buy, hold, sell, strong_sell FROM FUND_03_Recommendations WHERE date >= date('now', '-75 days') ORDER BY ticker, date`).all(),
    ]);

    const pricesByTicker = groupBy(priceRows.results, "ticker");
    const funds = indexBy(fundRows.results, "ticker");
    const earningsByTicker = groupBy(earningsRows.results, "ticker"); // already DESC by period
    const recsByTicker = groupBy(recsRows.results, "ticker");         // ASC by date

    // Portfolio in-sector P/E stats for rel_pe_sigma
    const sectorFwdPEs = {};
    for (const t of TICKERS) {
      const f = funds[t];
      if (f?.forward_pe && f.forward_pe > 0 && f.forward_pe < 300) {
        const bucket = SECTOR_BUCKET[t];
        (sectorFwdPEs[bucket] ||= []).push(f.forward_pe);
      }
    }
    const sectorPEStats = {};
    for (const [bucket, vals] of Object.entries(sectorFwdPEs)) {
      sectorPEStats[bucket] = {
        median: median(vals),
        sigma: stdev(vals),
      };
    }

    // Pre-compute sector ETF 63d returns
    const etfReturn63d = {};
    for (const etf of Object.values(SECTOR_ETF)) {
      etfReturn63d[etf] = pctReturn(pricesByTicker[etf] || [], 63);
    }
    const spyReturn63d = pctReturn(pricesByTicker["SPY"] || [], 63);

    // ---------- COMPUTE FACTORS ----------
    const rows = [];
    for (const ticker of TICKERS) {
      const f = funds[ticker];
      const prices = pricesByTicker[ticker] || [];
      const earnings = earningsByTicker[ticker] || [];
      const recs = recsByTicker[ticker] || [];
      const bucket = SECTOR_BUCKET[ticker];
      const etf = SECTOR_ETF[bucket];

      // 1. fwd_pe
      const fwd_pe = f?.forward_pe ?? null;

      // 2. rel_pe_sigma (vs in-sector portfolio peers)
      let rel_pe_sigma = null;
      let peer_median_pe = null;
      const peerStats = sectorPEStats[bucket];
      if (fwd_pe != null && peerStats && peerStats.sigma > 0) {
        rel_pe_sigma = (fwd_pe - peerStats.median) / peerStats.sigma;
        peer_median_pe = peerStats.median;
      }

      // 3. eps_rev_4w & 4. rev_breadth_4w from FUND_03 snapshots
      //    FUND_03 rows are ASC by date. Compare current (last) vs ~20 trading days ago (~28 calendar).
      const { eps_rev_4w, rev_breadth_4w } = computeRecommendationDeltas(recs);

      // 5. SUE: most-recent surprise / σ(last 8 surprises)
      const sue = computeSUE(earnings);

      // 6. mom_12_1: (price[t-21] / price[t-252]) − 1. prices are ASC by date.
      const mom_12_1 = computeMom121(prices);

      // 7. rs_vs_sector_3m = ticker 63d ret − sector ETF 63d ret (SPY fallback)
      const ticker63 = pctReturn(prices, 63);
      const bench63 = (etf && etfReturn63d[etf] != null) ? etfReturn63d[etf] : spyReturn63d;
      const rs_vs_sector_3m = (ticker63 != null && bench63 != null) ? ticker63 - bench63 : null;

      // 8. Piotroski F
      const piotroski_f = computePiotroski(f);

      // 9. days_to_catalyst: 91 − (days since last report), clamped
      const days_to_catalyst = computeDaysToCatalyst(earnings, today);

      rows.push({
        ticker,
        date: today,
        sector: bucket,
        fwd_pe,
        rel_pe_sigma,
        eps_rev_4w,
        rev_breadth_4w,
        sue,
        mom_12_1,
        rs_vs_sector_3m,
        piotroski_f,
        days_to_catalyst,
        short_pct_float: shortByTicker[ticker] ?? null,
        peer_median_pe,
      });
    }

    // ---------- WRITE DIRECT TO D1 ----------
    const nowIso = new Date().toISOString();
    let ingested = 0;
    for (const f of rows) {
      const id = await shortHash(`${f.ticker}|${f.date}`);
      await db.prepare(`
        INSERT INTO STOCK_FACTORS_daily
          (id, ticker, date, sector, fwd_pe, rel_pe_sigma, eps_rev_4w, rev_breadth_4w,
           sue, mom_12_1, rs_vs_sector_3m, piotroski_f, days_to_catalyst,
           short_pct_float, peer_median_pe, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sector = excluded.sector, fwd_pe = excluded.fwd_pe,
          rel_pe_sigma = excluded.rel_pe_sigma, eps_rev_4w = excluded.eps_rev_4w,
          rev_breadth_4w = excluded.rev_breadth_4w, sue = excluded.sue,
          mom_12_1 = excluded.mom_12_1, rs_vs_sector_3m = excluded.rs_vs_sector_3m,
          piotroski_f = excluded.piotroski_f, days_to_catalyst = excluded.days_to_catalyst,
          short_pct_float = excluded.short_pct_float, peer_median_pe = excluded.peer_median_pe,
          created_at = excluded.created_at
      `).bind(
        id, f.ticker, f.date, f.sector ?? null,
        f.fwd_pe ?? null, f.rel_pe_sigma ?? null,
        f.eps_rev_4w ?? null, f.rev_breadth_4w ?? null,
        f.sue ?? null, f.mom_12_1 ?? null, f.rs_vs_sector_3m ?? null,
        f.piotroski_f ?? null, f.days_to_catalyst ?? null,
        f.short_pct_float ?? null, f.peer_median_pe ?? null, nowIso,
      ).run();
      ingested++;
    }
    console.log(`[STOCK-FACTOR] Wrote ${ingested} rows to STOCK_FACTORS_daily`);

    return Response.json({ ok: true, computed: rows.length, ingested, date: today });
  },
};

// ============================================================
// FACTOR HELPERS
// ============================================================

function computeRecommendationDeltas(recs) {
  if (!recs || recs.length < 2) return { eps_rev_4w: null, rev_breadth_4w: null };

  // Finnhub /stock/recommendation returns monthly buckets (period = YYYY-MM-01),
  // monotonically sorted. The bucket immediately prior to the latest is always
  // ~1 month (≈4 weeks) older — the right reference for a "4-week delta".
  const latest = recs[recs.length - 1];
  const baseline = recs[recs.length - 2];
  if (!baseline) return { eps_rev_4w: null, rev_breadth_4w: null };

  const sumRecs = (r) => (r.strong_buy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strong_sell || 0);
  const bullish = (r) => (r.strong_buy || 0) + (r.buy || 0);
  const bearish = (r) => (r.sell || 0) + (r.strong_sell || 0);

  const totalNow = sumRecs(latest);
  if (totalNow === 0) return { eps_rev_4w: null, rev_breadth_4w: null };

  // EPS Rev 4w proxy: shift in bullish-ratio
  const bullNowRatio = bullish(latest) / totalNow;
  const totalPrev = sumRecs(baseline);
  const bullPrevRatio = totalPrev > 0 ? bullish(baseline) / totalPrev : 0;
  const eps_rev_4w = bullNowRatio - bullPrevRatio;

  // Rev Breadth 4w: shift in (bullish − bearish) ratio
  const netNow = (bullish(latest) - bearish(latest)) / totalNow;
  const netPrev = totalPrev > 0 ? (bullish(baseline) - bearish(baseline)) / totalPrev : 0;
  const rev_breadth_4w = netNow - netPrev;

  return { eps_rev_4w, rev_breadth_4w };
}

function computeSUE(earnings) {
  if (!earnings || earnings.length < 2) return null;
  const latest = earnings[0]; // already DESC by period
  if (latest.surprise == null) return null;
  const surprises = earnings.slice(0, 8).map((e) => e.surprise).filter((s) => s != null);
  if (surprises.length < 3) return null;
  const sigma = stdev(surprises);
  if (!sigma || sigma === 0) return null;
  return latest.surprise / sigma;
}

function computeMom121(prices) {
  if (!prices || prices.length < 253) return null;
  // prices sorted ASC by date; t-1 = last, t-21 = last-20, t-252 = last-251
  const tMinus21 = prices[prices.length - 21]?.close;
  const tMinus252 = prices[prices.length - 252]?.close;
  if (!tMinus21 || !tMinus252 || tMinus252 === 0) return null;
  return tMinus21 / tMinus252 - 1;
}

function pctReturn(prices, days) {
  if (!prices || prices.length <= days) return null;
  const latest = prices[prices.length - 1]?.close;
  const base = prices[prices.length - 1 - days]?.close;
  if (!latest || !base || base === 0) return null;
  return latest / base - 1;
}

function computePiotroski(f) {
  if (!f) return null;
  // Need all 9 feedstock fields. If any critical missing, return null.
  const needed = [
    "roa", "roa_prev", "cfo", "net_income", "total_assets", "total_debt",
    "total_debt_prev", "current_ratio", "current_ratio_prev",
    "shares_outstanding", "shares_outstanding_prev",
    "gross_margin_annual", "gross_margin_annual_prev",
    "asset_turnover", "asset_turnover_prev",
  ];
  for (const k of needed) {
    if (f[k] == null) return null;
  }

  let score = 0;
  // 1. ROA > 0
  if (f.roa > 0) score++;
  // 2. CFO > 0
  if (f.cfo > 0) score++;
  // 3. ΔROA > 0
  if (f.roa > f.roa_prev) score++;
  // 4. CFO > Net Income (accruals quality)
  if (f.cfo > f.net_income) score++;
  // 5. ΔLeverage < 0 (total_debt / total_assets decreasing)
  const levNow = f.total_assets > 0 ? f.total_debt / f.total_assets : null;
  const levPrev = f.total_assets_prev > 0 ? f.total_debt_prev / f.total_assets_prev : null;
  if (levNow != null && levPrev != null && levNow < levPrev) score++;
  // 6. ΔCurrent Ratio > 0
  if (f.current_ratio > f.current_ratio_prev) score++;
  // 7. No equity issuance: shares outstanding didn't increase
  if (f.shares_outstanding <= f.shares_outstanding_prev) score++;
  // 8. ΔGross Margin > 0
  if (f.gross_margin_annual > f.gross_margin_annual_prev) score++;
  // 9. ΔAsset Turnover > 0
  if (f.asset_turnover > f.asset_turnover_prev) score++;

  return score;
}

function computeDaysToCatalyst(earnings, todayStr) {
  if (!earnings || earnings.length === 0) return null;
  const latest = earnings[0];
  if (!latest.report_date) return null;
  const today = new Date(todayStr);
  const last = new Date(latest.report_date);
  const daysSince = Math.floor((today - last) / 86400000);
  const remaining = 91 - daysSince;
  // Clamp: negative → assume earnings imminent/overdue, cap at 0.
  // Very large → next earnings in a different cycle; cap at 180.
  return Math.max(0, Math.min(180, remaining));
}

// ============================================================
// GENERIC UTILS
// ============================================================

function indexBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    if (!map[r[key]]) map[r[key]] = r;
  }
  return map;
}

function groupBy(rows, key) {
  const map = {};
  for (const r of (rows || [])) {
    (map[r[key]] ||= []).push(r);
  }
  return map;
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(arr) {
  if (!arr || arr.length < 2) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
