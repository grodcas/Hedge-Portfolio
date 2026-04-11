/**
 * PRICE FETCHER — Polygon.io Daily OHLCV
 *
 * Fetches previous-day close for 25 portfolio tickers + SPY + 6 sector ETFs.
 * Rate limit: 5 calls/min → batch 5 at a time with 62s delay.
 * Posts results to portfolio-ingestor /ingest/prices.
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

const SECTOR_ETFS = ["SPY", "XLK", "XLF", "XLE", "XLV", "XLP", "XLI"];

const ALL_SYMBOLS = [...TICKERS, ...SECTOR_ETFS];

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/fetch-prices")
      return new Response("Not found", { status: 404 });

    const apiKey = env.POLYGON_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "POLYGON_KEY not set" }, { status: 500 });
    }

    console.log(`[PRICE FETCHER] Starting for ${ALL_SYMBOLS.length} symbols`);

    const results = [];
    const errors = [];

    // Batch 5 at a time (Polygon free tier: 5 calls/min)
    for (let i = 0; i < ALL_SYMBOLS.length; i += 5) {
      const batch = ALL_SYMBOLS.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(ticker => fetchPolygonPrice(ticker, apiKey))
      );

      for (let j = 0; j < batchResults.length; j++) {
        if (batchResults[j].status === "fulfilled" && batchResults[j].value) {
          results.push(batchResults[j].value);
        } else {
          const ticker = batch[j];
          const err = batchResults[j].reason?.message || "unknown";
          console.error(`[PRICE FETCHER] Failed ${ticker}: ${err}`);
          errors.push({ ticker, error: err });
        }
      }

      // Wait 62s between batches to respect 5/min rate limit
      if (i + 5 < ALL_SYMBOLS.length) {
        console.log(`[PRICE FETCHER] Batch ${Math.floor(i / 5) + 1} done (${results.length} fetched), waiting 62s...`);
        await sleep(62000);
      }
    }

    console.log(`[PRICE FETCHER] Fetched ${results.length}/${ALL_SYMBOLS.length} prices`);

    // POST to portfolio-ingestor
    if (results.length > 0) {
      try {
        const res = await fetch(`${INGESTOR_URL}/ingest/prices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(results),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[PRICE FETCHER] Ingestor error: ${errText}`);
        } else {
          const data = await res.json();
          console.log(`[PRICE FETCHER] Ingested: ${data.inserted || 0} rows`);
        }
      } catch (err) {
        console.error(`[PRICE FETCHER] Ingestor POST failed: ${err.message}`);
      }
    }

    return Response.json({
      ok: true,
      fetched: results.length,
      errors: errors.length,
      error_details: errors.slice(0, 5),
      date: results[0]?.date || new Date().toISOString().slice(0, 10),
    });
  },
};

async function fetchPolygonPrice(ticker, apiKey) {
  // Polygon uses dots in tickers (BRK.B works as-is)
  const symbol = ticker;
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apiKey=${apiKey}`;

  const res = await fetch(url);

  // If BRK.B fails, try BRK-B
  if (!res.ok && ticker === "BRK.B") {
    const retry = await fetch(`https://api.polygon.io/v2/aggs/ticker/BRK-B/prev?apiKey=${apiKey}`);
    if (!retry.ok) throw new Error(`Polygon ${retry.status} for ${ticker}`);
    return parsePolygonResponse(ticker, await retry.json());
  }

  if (!res.ok) throw new Error(`Polygon ${res.status} for ${ticker}`);

  return parsePolygonResponse(ticker, await res.json());
}

function parsePolygonResponse(ticker, data) {
  const result = data.results?.[0];
  if (!result) throw new Error(`No results for ${ticker}`);

  // Polygon 't' is timestamp in ms, convert to date
  const date = new Date(result.t).toISOString().slice(0, 10);

  return {
    ticker,
    date,
    open: result.o,
    high: result.h,
    low: result.l,
    close: result.c,
    volume: result.v,
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
