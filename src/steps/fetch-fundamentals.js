// src/steps/fetch-fundamentals.js
//
// Local Alpha Vantage OVERVIEW fetcher. Runs from the user's machine IP
// because Alpha Vantage rate-limits its free tier per IP, and Cloudflare
// Workers' shared egress pool is already exhausted by other users.
//
// Fetches the OVERVIEW endpoint for each portfolio ticker, batches 5-at-a-time
// with a 62s pause between batches (5/min burst ceiling), and POSTs the
// results to portfolio-ingestor /ingest/fundamentals.
//
// Idempotency: queries /query/fundamentals?date=today first and skips
// tickers that already have a row.

import { INGEST_BASE } from "../lib/config.js";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

function parseNum(val) {
  if (val == null || val === "None" || val === "-" || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchOverview(ticker, apiKey, today) {
  const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage ${res.status} for ${ticker}`);
  const data = await res.json();
  if (!data.Symbol && !data.PERatio) {
    if (data.Information) throw new Error(`RateLimit: ${data.Information.slice(0, 150)}`);
    if (data.Note) throw new Error(`Note: ${data.Note.slice(0, 150)}`);
    if (data["Error Message"]) throw new Error(`Error: ${data["Error Message"].slice(0, 150)}`);
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

export async function fetchFundamentals(config, logger, results) {
  logger.log("FUNDAMENTALS", "Starting Alpha Vantage OVERVIEW fetch...");

  const apiKey = process.env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    logger.log("FUNDAMENTALS", "ALPHAVANTAGE_KEY not set — skipping", "warn");
    return { data: null, fetched: 0, errors: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Idempotency: which tickers already have a row for today?
  let tickersToFetch = [...TICKERS];
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals?date=${today}`);
    if (res.ok) {
      const existing = await res.json();
      const rows = Array.isArray(existing) ? existing : (existing?.results || []);
      const have = new Set(rows.map(r => r.ticker));
      tickersToFetch = TICKERS.filter(t => !have.has(t));
      if (tickersToFetch.length === 0) {
        logger.log("FUNDAMENTALS", `All ${TICKERS.length} already fetched today — skipping`, "ok");
        return { data: [], fetched: 0, skipped: TICKERS.length };
      }
      if (tickersToFetch.length < TICKERS.length) {
        logger.log("FUNDAMENTALS", `Partial: ${tickersToFetch.length}/${TICKERS.length} missing`);
      }
    }
  } catch (err) {
    logger.log("FUNDAMENTALS", `Idempotency check failed, proceeding: ${err.message}`, "warn");
  }

  const fetched = [];
  const errors = [];

  for (let i = 0; i < tickersToFetch.length; i += 5) {
    const batch = tickersToFetch.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(t => fetchOverview(t, apiKey, today))
    );
    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].status === "fulfilled") {
        fetched.push(batchResults[j].value);
      } else {
        errors.push({ ticker: batch[j], error: batchResults[j].reason?.message || "unknown" });
      }
    }
    logger.log("FUNDAMENTALS", `Batch ${Math.floor(i / 5) + 1}: ${fetched.length}/${i + batch.length} fetched`);
    if (i + 5 < tickersToFetch.length) await sleep(62000);
  }

  // All failed → hard error
  if (fetched.length === 0 && errors.length > 0) {
    const firstErr = errors[0].error;
    logger.log("FUNDAMENTALS", `All ${errors.length} calls failed. First: ${firstErr}`, "fail");
    throw new Error(`All Alpha Vantage calls failed. First error: ${firstErr}`);
  }

  // POST to ingestor
  if (fetched.length > 0) {
    try {
      const res = await fetch(`${INGEST_BASE}/ingest/fundamentals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetched),
      });
      if (res.ok) {
        const data = await res.json();
        logger.log("FUNDAMENTALS", `Ingested ${data.inserted || fetched.length} rows`, "ok");
      } else {
        logger.log("FUNDAMENTALS", `Ingestor returned HTTP ${res.status}`, "warn");
      }
    } catch (err) {
      logger.log("FUNDAMENTALS", `Ingest POST failed: ${err.message}`, "fail");
      throw err;
    }
  }

  return { data: fetched, fetched: fetched.length, errors: errors.length };
}

export default fetchFundamentals;
