// scripts/backfill-prices.js
//
// One-shot historical price backfill. For each of the 25 portfolio tickers
// + 12 sector ETFs + SPY, fetch 2 years of daily OHLCV from Polygon and
// POST to the ingestor's /ingest/prices endpoint.
//
// Polygon free tier: 5 req/min, each call returns up to 730 bars for one
// symbol. 38 symbols × 12s spacing ≈ 8 min wall-clock.
//
// Resumability: before fetching a ticker, check /query/prices?ticker=X&range=500.
// If >= 400 bars already present, skip.
//
// Idempotency: /ingest/prices upserts on shortHash(ticker|date), so re-runs
// are safe — no duplicates.
//
// Usage:  node scripts/backfill-prices.js
// Logs:   logs/backfill-prices.log

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "backfill-prices.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const POLYGON_KEY = process.env.POLYGON_KEY;
if (!POLYGON_KEY) { console.error("❌ POLYGON_KEY not set"); process.exit(1); }

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];
const ETFS = ["SPY", "XLK", "XLF", "XLE", "XLV", "XLP", "XLI", "XLY", "XLC", "XLB", "XLU", "XLRE"];
const ALL = [...TICKERS, ...ETFS];

const YEARS_BACK = 2;
const RATE_DELAY_MS = 12_000;
const MIN_BARS_TO_SKIP = 400;
const INGEST_BATCH_SIZE = 200;

function isoDate(d) { return d.toISOString().slice(0, 10); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

async function existingBarCount(ticker) {
  try {
    const res = await fetch(`${INGEST_BASE}/query/prices?ticker=${encodeURIComponent(ticker)}&range=500`);
    if (!res.ok) return 0;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

function polygonSymbol(ticker) {
  return ticker === "BRK.B" ? "BRK-B" : ticker;
}

async function fetchPolygonBars(ticker, fromDate, toDate) {
  const attempts = [polygonSymbol(ticker)];
  if (ticker === "BRK.B") attempts.push("BRK.B"); // try both forms
  for (const sym of attempts) {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    if (res.status === 429) {
      log(`  429 ${ticker}, sleeping 60s then retrying once`);
      await sleep(60_000);
      const retry = await fetch(url);
      if (!retry.ok) continue;
      const data = await retry.json();
      if ((data.results || []).length > 0) return data.results;
      continue;
    }
    if (!res.ok) continue;
    const data = await res.json();
    if ((data.results || []).length > 0) return data.results;
  }
  throw new Error(`Polygon returned 0 bars for ${ticker} across ${attempts.length} symbol form(s)`);
}

function toIngestRows(ticker, bars) {
  return bars.map(b => ({
    ticker,
    date: new Date(b.t).toISOString().slice(0, 10),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

async function postBatch(rows) {
  let sent = 0;
  for (let i = 0; i < rows.length; i += INGEST_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INGEST_BATCH_SIZE);
    const res = await fetch(`${INGEST_BASE}/ingest/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Ingestor ${res.status}: ${await res.text()}`);
    const data = await res.json();
    sent += data.inserted || chunk.length;
  }
  return sent;
}

async function main() {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - YEARS_BACK);
  const fromStr = isoDate(from);
  const toStr = isoDate(to);

  log(`Starting backfill: ${ALL.length} symbols, ${fromStr} → ${toStr}`);
  let ingested = 0, skipped = 0, failed = 0;

  for (let idx = 0; idx < ALL.length; idx++) {
    const ticker = ALL[idx];
    const existing = await existingBarCount(ticker);
    if (existing >= MIN_BARS_TO_SKIP) {
      log(`  [${idx + 1}/${ALL.length}] ${ticker}: already has ${existing} bars — skip`);
      skipped++;
      continue;
    }

    try {
      const bars = await fetchPolygonBars(ticker, fromStr, toStr);
      if (bars.length === 0) {
        log(`  [${idx + 1}/${ALL.length}] ${ticker}: 0 bars returned — skip`);
        failed++;
      } else {
        const rows = toIngestRows(ticker, bars);
        const sent = await postBatch(rows);
        ingested += sent;
        log(`  [${idx + 1}/${ALL.length}] ${ticker}: ${bars.length} bars fetched, ${sent} ingested`);
      }
    } catch (err) {
      log(`  [${idx + 1}/${ALL.length}] ${ticker}: ❌ ${err.message}`);
      failed++;
    }

    if (idx < ALL.length - 1) {
      await sleep(RATE_DELAY_MS);
    }
  }

  log(`\nDone. Ingested=${ingested} Skipped=${skipped} Failed=${failed}`);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
