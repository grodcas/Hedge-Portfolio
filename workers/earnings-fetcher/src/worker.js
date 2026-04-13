/**
 * EARNINGS FETCHER — Finnhub Earnings + Analyst Recommendations
 *
 * Fetches /stock/earnings and /stock/recommendation for 25 portfolio tickers.
 * Rate limit: 60 calls/min — 50 calls (2 per ticker) is safe in parallel.
 * Posts results to portfolio-ingestor /ingest/earnings and /ingest/recommendations.
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/fetch-earnings")
      return new Response("Not found", { status: 404 });

    const apiKey = env.FINNHUB_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "FINNHUB_KEY not set" }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    console.log(`[EARNINGS] Starting for ${TICKERS.length} tickers (${today})`);

    // ---------- IDEMPOTENCY: skip if already fetched today ----------
    // Finnhub free tier is 60/min — not a hard daily quota — but retries
    // re-burn ~50 API calls per run, which is wasteful. Use D1 to detect
    // "already fetched today" via FUND_02_Earnings.created_at.
    try {
      const existing = await env.DB.prepare(
        `SELECT COUNT(DISTINCT ticker) AS n FROM FUND_02_Earnings
         WHERE date(COALESCE(created_at, '1970-01-01')) = ?`
      ).bind(today).first();
      if ((existing?.n || 0) >= TICKERS.length) {
        console.log(`[EARNINGS] All ${TICKERS.length} tickers already fetched today — skipping`);
        return Response.json({
          ok: true,
          earnings_count: 0,
          recommendations_count: 0,
          errors: 0,
          skipped: true,
          reason: "already_complete",
          date: today,
        });
      }
    } catch (err) {
      console.warn(`[EARNINGS] Idempotency check failed, proceeding cautiously: ${err.message}`);
    }

    // Fetch all in parallel — 50 calls well within 60/min
    const earningsResults = [];
    const recsResults = [];
    const errors = [];

    const settled = await Promise.allSettled(
      TICKERS.map(async (ticker) => {
        const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;

        // Fetch earnings
        const earnings = await fetchFinnhub(
          `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${apiKey}`,
          ticker
        );
        if (earnings) {
          for (const e of earnings) {
            earningsResults.push({
              ticker,
              period: e.period,
              estimate: e.estimate ?? null,
              actual: e.actual ?? null,
              surprise: e.surprise ?? null,
              surprise_pct: e.surprisePercent ?? null,
              report_date: e.period,
            });
          }
        }

        // Fetch recommendations
        const recs = await fetchFinnhub(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${apiKey}`,
          ticker
        );
        if (recs && recs.length > 0) {
          // Take last 6 months of recommendations
          for (const r of recs.slice(0, 6)) {
            recsResults.push({
              ticker,
              date: r.period,
              strong_buy: r.strongBuy ?? 0,
              buy: r.buy ?? 0,
              hold: r.hold ?? 0,
              sell: r.sell ?? 0,
              strong_sell: r.strongSell ?? 0,
            });
          }
        }
      })
    );

    // Count errors
    for (const r of settled) {
      if (r.status === "rejected") {
        errors.push(r.reason?.message || "unknown");
      }
    }

    console.log(`[EARNINGS] Fetched ${earningsResults.length} earnings, ${recsResults.length} recommendations`);

    // POST earnings to ingestor
    if (earningsResults.length > 0) {
      try {
        const res = await fetch(`${INGESTOR_URL}/ingest/earnings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(earningsResults),
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[EARNINGS] Ingested earnings: ${data.inserted || 0}`);
        }
      } catch (err) {
        console.error(`[EARNINGS] Ingest earnings failed: ${err.message}`);
      }
    }

    // POST recommendations to ingestor
    if (recsResults.length > 0) {
      try {
        const res = await fetch(`${INGESTOR_URL}/ingest/recommendations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recsResults),
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[EARNINGS] Ingested recommendations: ${data.inserted || 0}`);
        }
      } catch (err) {
        console.error(`[EARNINGS] Ingest recommendations failed: ${err.message}`);
      }
    }

    return Response.json({
      ok: true,
      earnings_count: earningsResults.length,
      recommendations_count: recsResults.length,
      errors: errors.length,
      date: today,
    });
  },
};

async function fetchFinnhub(url, ticker) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[EARNINGS] Finnhub ${res.status} for ${ticker}: ${url.split("?")[0]}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[EARNINGS] Finnhub error for ${ticker}: ${err.message}`);
    return null;
  }
}
