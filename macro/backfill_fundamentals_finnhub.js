// Backfill FUND_01_Fundamentals via Finnhub /stock/metric.
// Finnhub's free tier is 60 req/min, no IP throttle like Alpha Vantage.
// Reads existing FUND_01 rows, fetches the 25 tracked tickers in parallel
// with modest concurrency, POSTs to portfolio-ingestor /ingest/fundamentals.
//
// Usage:  node macro/backfill_fundamentals_finnhub.js

import "dotenv/config";
import axios from "axios";

const FINNHUB_KEY = process.env.FINNHUB_KEY;
const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchMetric(ticker) {
  // Finnhub uses BRK.B as "BRK.B" directly (unlike Alpha Vantage which needs BRK-B)
  const { data } = await axios.get("https://finnhub.io/api/v1/stock/metric", {
    params: { symbol: ticker, metric: "all", token: FINNHUB_KEY },
  });
  const m = data?.metric;
  if (!m || Object.keys(m).length === 0) throw new Error("empty metric response");
  return m;
}

async function fetchQuote(ticker) {
  const { data } = await axios.get("https://finnhub.io/api/v1/quote", {
    params: { symbol: ticker, token: FINNHUB_KEY },
  });
  return data || {};
}

async function fetchPriceTarget(ticker) {
  try {
    const { data } = await axios.get("https://finnhub.io/api/v1/stock/price-target", {
      params: { symbol: ticker, token: FINNHUB_KEY },
    });
    return num(data?.targetMean);
  } catch {
    return null;
  }
}

async function buildRow(ticker, today) {
  const [metric, quote, target] = await Promise.all([
    fetchMetric(ticker),
    fetchQuote(ticker),
    fetchPriceTarget(ticker),
  ]);

  // Finnhub margins are percentages (55.6 = 55.6%). FUND_01 expects decimals.
  const profitMargin =
    metric.netProfitMarginTTM != null ? num(metric.netProfitMarginTTM) / 100 : null;
  const operatingMargin =
    metric.operatingMarginTTM != null ? num(metric.operatingMarginTTM) / 100 : null;
  // Finnhub market cap is in millions; FUND_01 expects raw units.
  const marketCap =
    metric.marketCapitalization != null ? num(metric.marketCapitalization) * 1e6 : null;
  // Dividend yield from Finnhub is already a decimal (0.0201 for 2.01%).
  const dividendYield = num(metric.currentDividendYieldTTM);
  // Revenue TTM: compute from per-share × (marketCap / price) if available.
  const price = num(quote.c); // current price
  let revenueTTM = null;
  if (
    price &&
    price > 0 &&
    marketCap &&
    num(metric.revenuePerShareTTM) != null
  ) {
    const shares = marketCap / price;
    revenueTTM = num(metric.revenuePerShareTTM) * shares;
  }

  return {
    ticker,
    date: today,
    pe_ratio: num(metric.peTTM),
    forward_pe: num(metric.forwardPE),
    eps: num(metric.epsTTM) ?? num(metric.epsInclExtraItemsTTM),
    revenue_ttm: revenueTTM,
    profit_margin: profitMargin,
    operating_margin: operatingMargin,
    market_cap: marketCap,
    week_52_high: num(metric["52WeekHigh"]),
    week_52_low: num(metric["52WeekLow"]),
    dma_50: null, // Finnhub /stock/metric doesn't expose DMAs
    dma_200: null,
    analyst_target: target,
    dividend_yield: dividendYield,
    beta: num(metric.beta),
    raw_json: JSON.stringify({ metric, quote, target }),
  };
}

async function main() {
  if (!FINNHUB_KEY) {
    console.error("FINNHUB_KEY not set");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  const errors = [];

  // Finnhub free tier is 60/min — 25 tickers × 3 calls each = 75 calls.
  // Run sequentially in pairs of 5 tickers with a small delay for safety.
  for (let i = 0; i < TICKERS.length; i += 5) {
    const batch = TICKERS.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map((t) => buildRow(t, today)));
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        rows.push(results[j].value);
        console.log(
          `[ok] ${batch[j]}  PE=${results[j].value.pe_ratio}  margin=${results[j].value.profit_margin?.toFixed(3)}`,
        );
      } else {
        errors.push({ ticker: batch[j], error: results[j].reason?.message });
        console.warn(`[fail] ${batch[j]}: ${results[j].reason?.message}`);
      }
    }
    if (i + 5 < TICKERS.length) {
      await new Promise((r) => setTimeout(r, 1200)); // ~60/min pace
    }
  }

  console.log(`\n[done] ${rows.length} fetched, ${errors.length} errors`);

  if (rows.length === 0) {
    console.error("no rows — aborting");
    process.exit(1);
  }

  // POST to ingestor
  const res = await fetch(`${INGEST_BASE}/ingest/fundamentals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error(`ingest POST failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const result = await res.json();
  console.log(`[ingest] ${result.inserted || rows.length} rows written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
