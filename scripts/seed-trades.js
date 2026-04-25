// scripts/seed-trades.js
//
// One-shot synthetic trade seed. Creates 25 BUY trades at ~60-day-old
// close prices, sized so each position ≈ 4% of $1M. Tagged notes="SEED"
// so they can be purged later via
//   DELETE FROM TRADE_01_Ledger WHERE notes = 'SEED';
//
// After seeding, triggers position-builder + nav-builder so the dashboard
// sees real KPIs immediately.
//
// Idempotent: /ingest/trades upserts on shortHash(ticker|date|side|qty|price).
//
// Usage: node scripts/seed-trades.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "seed-trades.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const POS_BUILDER = "https://position-builder.gines-rodriguez-castro.workers.dev";
const NAV_BUILDER = "https://nav-builder.gines-rodriguez-castro.workers.dev";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

const INITIAL_CAPITAL = 1_000_000;
const TARGET_WEIGHT = 0.04; // 4% per position
const DOLLARS_PER_POSITION = INITIAL_CAPITAL * TARGET_WEIGHT;
const BARS_BACK = 60;

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

async function fetchPriceAtOffset(ticker, offset) {
  const res = await fetch(`${INGEST_BASE}/query/prices?ticker=${encodeURIComponent(ticker)}&range=${offset + 5}`);
  if (!res.ok) throw new Error(`Prices ${ticker}: ${res.status}`);
  const rows = await res.json();
  // rows returned DESC by date. Index `offset` = `offset` bars ago.
  const row = rows[offset];
  if (!row) throw new Error(`No bar at offset ${offset} for ${ticker} (only ${rows.length} bars)`);
  return { date: row.date, close: row.close };
}

async function main() {
  log(`Seeding ${TICKERS.length} synthetic BUY trades (~${BARS_BACK} bars ago, ~$${DOLLARS_PER_POSITION}/position)`);

  const trades = [];
  for (const ticker of TICKERS) {
    try {
      const { date, close } = await fetchPriceAtOffset(ticker, BARS_BACK);
      const qty = Math.round(DOLLARS_PER_POSITION / close * 100) / 100; // 2-decimal share count
      trades.push({
        trade_date: date,
        ticker,
        side: "BUY",
        qty,
        price: close,
        fees: 0,
        notes: "SEED",
      });
      log(`  ${ticker}: BUY ${qty} @ $${close} on ${date} = $${(qty * close).toFixed(0)}`);
    } catch (err) {
      log(`  ${ticker}: ❌ ${err.message}`);
    }
  }

  if (trades.length === 0) {
    log("No trades to seed — aborting");
    process.exit(1);
  }

  // POST batch
  const res = await fetch(`${INGEST_BASE}/ingest/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trades),
  });
  if (!res.ok) {
    log(`Ingest failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const out = await res.json();
  log(`\nIngested ${out.inserted} trade rows`);

  // Trigger builders
  log("Triggering position-builder...");
  const p = await fetch(`${POS_BUILDER}/compute-positions`, { method: "POST" });
  log(`  ${p.status}: ${await p.text()}`);

  log("Triggering nav-builder...");
  const n = await fetch(`${NAV_BUILDER}/compute-nav`, { method: "POST" });
  log(`  ${n.status}: ${await n.text()}`);

  log("\nDone.");
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
