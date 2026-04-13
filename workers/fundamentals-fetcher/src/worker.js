/**
 * FUNDAMENTALS FETCHER — Alpha Vantage OVERVIEW
 *
 * Fetches fundamental data (P/E, EPS, margins, etc.) for 25 portfolio tickers.
 * Rate limit: 25 calls/day total, 5/min burst.
 *
 * IDEMPOTENCY PROTECTION:
 * Alpha Vantage has a hard 25 calls/day limit. If this worker runs twice in
 * one day (e.g., because of a Cloudflare Workflow retry), the second run
 * could burn the entire daily quota. Before making any API calls, we check
 * D1 FUND_01_Fundamentals for today's date — if we already have data for
 * all 25 tickers, we skip entirely. If partial, we only fetch the missing ones.
 *
 * Runs as part of daily_update (wave 1000) alongside other data fetchers.
 * Posts results to portfolio-ingestor /ingest/fundamentals.
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

async function runFundamentalsFetcher(env) {
  const apiKey = env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    return { ok: false, error: "ALPHAVANTAGE_KEY not set" };
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[FUNDAMENTALS] Starting for ${TICKERS.length} tickers (${today})`);

  // ---------- IDEMPOTENCY: skip tickers already fetched today ----------
  // Protects the 25/day Alpha Vantage quota from being burned on retries.
  let tickersToFetch = [...TICKERS];
  try {
    const { results: existing } = await env.DB.prepare(
      `SELECT ticker FROM FUND_01_Fundamentals WHERE date = ?`
    ).bind(today).all();
    const alreadyHave = new Set((existing || []).map(r => r.ticker));
    tickersToFetch = TICKERS.filter(t => !alreadyHave.has(t));

    if (alreadyHave.size > 0) {
      console.log(`[FUNDAMENTALS] Already have ${alreadyHave.size} tickers for ${today}: ${[...alreadyHave].join(",")}`);
    }
    if (tickersToFetch.length === 0) {
      console.log(`[FUNDAMENTALS] All 25 tickers already fetched today — skipping, protecting Alpha Vantage quota`);
      return { ok: true, date: today, fetched: 0, skipped: 25, reason: "already_complete" };
    }
    console.log(`[FUNDAMENTALS] Fetching ${tickersToFetch.length} missing ticker(s)`);
  } catch (err) {
    console.warn(`[FUNDAMENTALS] Idempotency check failed, proceeding cautiously: ${err.message}`);
  }

  const results = [];
  const errors = [];

  // Batch 5 at a time (5/min burst), 62s between batches
  for (let i = 0; i < tickersToFetch.length; i += 5) {
    const batch = tickersToFetch.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(ticker => fetchOverview(ticker, apiKey, today))
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === "fulfilled" && batchResults[j].value) {
        results.push(batchResults[j].value);
      } else {
        const ticker = batch[j];
        const err = batchResults[j].reason?.message || "unknown";
        console.error(`[FUNDAMENTALS] Failed ${ticker}: ${err}`);
        errors.push({ ticker, error: err });
      }
    }

    if (i + 5 < tickersToFetch.length) {
      console.log(`[FUNDAMENTALS] Batch ${Math.floor(i / 5) + 1} done, waiting 62s...`);
      await sleep(62000);
    }
  }

  console.log(`[FUNDAMENTALS] Fetched ${results.length}/${tickersToFetch.length}`);

  // POST to portfolio-ingestor
  if (results.length > 0) {
    try {
      const res = await fetch(`${INGESTOR_URL}/ingest/fundamentals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results),
      });
      if (!res.ok) {
        console.error(`[FUNDAMENTALS] Ingestor error: ${await res.text()}`);
      } else {
        const data = await res.json();
        console.log(`[FUNDAMENTALS] Ingested: ${data.inserted || 0} rows`);
      }
    } catch (err) {
      console.error(`[FUNDAMENTALS] Ingestor POST failed: ${err.message}`);
    }
  }

  return {
    ok: true,
    fetched: results.length,
    errors: errors.length,
    error_details: errors.slice(0, 5),
    date: today,
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/fetch-fundamentals")
      return new Response("Not found", { status: 404 });

    const result = await runFundamentalsFetcher(env);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  },

};

async function fetchOverview(ticker, apiKey, today) {
  // Alpha Vantage uses dash for BRK.B
  const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage ${res.status} for ${ticker}`);

  const data = await res.json();

  // Alpha Vantage returns {} or { "Note": "..." } on limit/error
  if (!data.Symbol && !data.PERatio) {
    if (data.Note) throw new Error(`Rate limit: ${data.Note.slice(0, 100)}`);
    if (data["Error Message"]) throw new Error(`Error: ${data["Error Message"].slice(0, 100)}`);
    throw new Error(`Empty response for ${ticker}`);
  }

  return {
    ticker,
    date: today,
    pe_ratio: parseNum(data.PERatio),
    forward_pe: parseNum(data.ForwardPE),
    eps: parseNum(data.EPS),
    revenue_ttm: parseNum(data.RevenueTTM),
    profit_margin: parseNum(data.ProfitMargin),
    operating_margin: parseNum(data.OperatingMarginTTM),
    market_cap: parseNum(data.MarketCapitalization),
    week_52_high: parseNum(data["52WeekHigh"]),
    week_52_low: parseNum(data["52WeekLow"]),
    dma_50: parseNum(data["50DayMovingAverage"]),
    dma_200: parseNum(data["200DayMovingAverage"]),
    analyst_target: parseNum(data.AnalystTargetPrice),
    dividend_yield: parseNum(data.DividendYield),
    beta: parseNum(data.Beta),
    raw_json: JSON.stringify(data),
  };
}

/** Parse Alpha Vantage value — "None", "-", "0" → null; otherwise parseFloat */
function parseNum(val) {
  if (val === undefined || val === null || val === "None" || val === "-" || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
