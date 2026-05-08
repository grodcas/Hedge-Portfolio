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
    if (url.pathname === "/fetch-calendar") return fetchCalendar(req, env);
    if (url.pathname !== "/fetch-earnings")
      return new Response("Not found", { status: 404 });

    const apiKey = env.FINNHUB_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "FINNHUB_KEY not set" }, { status: 500 });
    }

    const force = url.searchParams.get("force") === "1";
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[EARNINGS] Starting for ${TICKERS.length} tickers (${today})${force ? " [force]" : ""}`);

    // ---------- IDEMPOTENCY: skip if already fetched today ----------
    // Finnhub free tier is 60/min — not a hard daily quota — but retries
    // re-burn ~50 API calls per run, which is wasteful. Use D1 to detect
    // "already fetched today" via FUND_02_Earnings.created_at. Bypassed
    // with ?force=1 (used to seed/refresh EARNINGS_CALENDAR_consensus on
    // demand without waiting for tomorrow's cron).
    if (!force) {
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
            // Skip all-null rows. report_date here is the fiscal_period_ending
            // (what Finnhub returns); the actual release-date lives in
            // EARNINGS_CALENDAR_consensus.last_report_date / next_earnings_date,
            // populated by /fetch-calendar.
            const estimate = e.estimate ?? null;
            const actual = e.actual ?? null;
            const surprise = e.surprise ?? null;
            const surprisePct = e.surprisePercent ?? null;
            if (estimate == null && actual == null && surprise == null && surprisePct == null) {
              continue;
            }
            earningsResults.push({
              ticker,
              period: e.period,
              estimate,
              actual,
              surprise,
              surprise_pct: surprisePct,
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


    // All-fail guard: if every ticker errored AND no data was written, return
    // a non-200 so the workflow marks this job 'failed' (not 'done'). Keeps
    // downstream consumers honest via the requires-gate.
    if (earningsResults.length === 0 && recsResults.length === 0 && errors.length > 0) {
      return Response.json({
        ok: false,
        error: "all_tickers_failed",
        errors: errors.length,
        error_sample: errors.slice(0, 3),
        date: today,
      }, { status: 500 });
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

// /fetch-calendar — separate handler so the market-wide /calendar/earnings
// call + ingest POST run in their own subrequest budget. Doing this inside
// /fetch-earnings pushed us past Cloudflare's 50-subrequest cap (we already
// spend 50 on per-symbol earnings + recommendation calls).
//
// Strategy: ONE market-wide /calendar/earnings call (no &symbol=) for the
// next 90 days, filter to TICKERS, take earliest upcoming print per symbol,
// merge in last_report_date from FUND_02_Earnings (read straight from D1).
async function fetchCalendar(req, env) {
  const url = new URL(req.url);
  const apiKey = env.FINNHUB_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "FINNHUB_KEY not set" }, { status: 500 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const calTo = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const calRaw = await fetchFinnhub(
    `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${calTo}&token=${apiKey}`,
    "MARKET"
  );
  const calArr = calRaw?.earningsCalendar || [];

  // Earliest upcoming unfiled print per symbol.
  const nextBySymbol = new Map();
  for (const r of calArr) {
    if (!r.symbol || !r.date || r.date < today) continue;
    if (r.epsActual != null) continue;
    const prev = nextBySymbol.get(r.symbol);
    if (!prev || r.date < prev) nextBySymbol.set(r.symbol, r.date);
  }

  // last_report_date: latest period in FUND_02_Earnings per ticker. One
  // grouped query, not 25.
  const lastRows = await env.DB.prepare(
    `SELECT ticker, MAX(period) AS last_period FROM FUND_02_Earnings GROUP BY ticker`
  ).all();
  const lastByTicker = new Map();
  for (const r of (lastRows.results || [])) {
    if (r.last_period) lastByTicker.set(r.ticker, r.last_period);
  }

  const items = [];
  for (const ticker of TICKERS) {
    const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
    const next = nextBySymbol.get(symbol) || null;
    const last = lastByTicker.get(ticker) || null;
    if (!next && !last) continue;
    items.push({
      ticker,
      next_earnings_date: next,
      last_report_date: last,
      source: "finnhub",
    });
  }

  // Write directly to D1 via the bound DB. workers.dev → workers.dev HTTP
  // fetch hits Cloudflare error 1042 (cross-worker on the same zone), so
  // we bypass the ingestor and use the binding we already have.
  let inserted = 0;
  let writeError = null;
  const now = new Date().toISOString();
  try {
    for (const e of items) {
      await env.DB.prepare(`
        INSERT INTO EARNINGS_CALENDAR_consensus
          (ticker, next_earnings_date, last_report_date, source, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          next_earnings_date = excluded.next_earnings_date,
          last_report_date   = excluded.last_report_date,
          source             = excluded.source,
          updated_at         = excluded.updated_at
      `).bind(
        e.ticker,
        e.next_earnings_date ?? null,
        e.last_report_date ?? null,
        e.source ?? "finnhub",
        now,
      ).run();
      inserted++;
    }
  } catch (err) {
    writeError = err.message;
  }

  return Response.json({
    ok: !writeError,
    market_rows: calArr.length,
    upcoming: nextBySymbol.size,
    items: items.length,
    inserted,
    write_error: writeError,
    date: today,
  });
}
