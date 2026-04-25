// scripts/backfill-recs.js
//
// One-shot historical analyst-recommendation backfill. For each of the 25
// portfolio tickers, fetch all monthly recommendation buckets Finnhub
// returns (typically the last ~12 months) and POST them to the ingestor's
// /ingest/recommendations endpoint.
//
// Note: the daily earnings-fetcher worker only keeps the last 6 months.
// This script intentionally does NOT filter — full historical coverage is
// needed for the stock-factor-builder's eps_rev_4w / rev_breadth_4w deltas.
// Idempotent upsert on shortHash(ticker|recs|date) makes re-runs safe.
//
// Finnhub free tier: 60 req/min. 25 calls ≈ 30s wall-clock.
//
// Usage:  node scripts/backfill-recs.js
// Logs:   logs/backfill-recs.log

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "backfill-recs.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const FINNHUB_KEY = process.env.FINNHUB_KEY;
if (!FINNHUB_KEY) { console.error("❌ FINNHUB_KEY not set"); process.exit(1); }

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

const RATE_DELAY_MS = 1_100;
const MIN_ROWS_TO_SKIP = 6;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

function finnhubSymbol(ticker) {
  return ticker === "BRK.B" ? "BRK-B" : ticker;
}

async function existingCount(ticker) {
  try {
    const res = await fetch(`${INGEST_BASE}/query/recommendations?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) return 0;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

async function fetchFinnhubRecs(ticker) {
  const sym = finnhubSymbol(ticker);
  const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${res.status} for ${ticker}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function main() {
  log(`Starting recommendations backfill: ${TICKERS.length} tickers`);
  let ingested = 0, skipped = 0, failed = 0;

  for (let idx = 0; idx < TICKERS.length; idx++) {
    const ticker = TICKERS[idx];
    const existing = await existingCount(ticker);
    if (existing >= MIN_ROWS_TO_SKIP) {
      log(`  [${idx + 1}/${TICKERS.length}] ${ticker}: already has ${existing} rows — skip`);
      skipped++;
      continue;
    }

    try {
      const data = await fetchFinnhubRecs(ticker);
      if (data.length === 0) {
        log(`  [${idx + 1}/${TICKERS.length}] ${ticker}: 0 buckets returned — skip`);
        failed++;
      } else {
        const rows = data.map(r => ({
          ticker,
          date: r.period,
          strong_buy: r.strongBuy ?? 0,
          buy: r.buy ?? 0,
          hold: r.hold ?? 0,
          sell: r.sell ?? 0,
          strong_sell: r.strongSell ?? 0,
        }));
        const res = await fetch(`${INGEST_BASE}/ingest/recommendations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rows),
        });
        if (!res.ok) throw new Error(`Ingestor ${res.status}: ${await res.text()}`);
        const out = await res.json();
        ingested += out.inserted || rows.length;
        log(`  [${idx + 1}/${TICKERS.length}] ${ticker}: ${data.length} buckets, ${out.inserted || rows.length} ingested`);
      }
    } catch (err) {
      log(`  [${idx + 1}/${TICKERS.length}] ${ticker}: ❌ ${err.message}`);
      failed++;
    }

    if (idx < TICKERS.length - 1) await sleep(RATE_DELAY_MS);
  }

  log(`\nDone. Ingested=${ingested} Skipped=${skipped} Failed=${failed}`);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
