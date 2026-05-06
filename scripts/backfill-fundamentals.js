// scripts/backfill-fundamentals.js
//
// One-shot quarterly fundamentals backfill via Polygon /vX/reference/financials.
// Per portfolio ticker, fetches the last 8 quarterly statements (IS+BS+CF) and
// POSTs them to portfolio-ingestor /ingest/fundamentals-quarterly. Fills the
// FUND_01_Quarterly history that fetch-fundamentals.js can only build a quarter
// at a time. Required for Piotroski-F (needs ≥4 quarters of YoY context).
//
// Polygon free tier: 5 req/min. 25 tickers × 12s spacing ≈ 5 min wall-clock.
// Idempotent — UNIQUE INDEX on (ticker, fiscal_period_ending) on the table.
//
// Usage: node scripts/backfill-fundamentals.js
// Logs:  logs/backfill-fundamentals.log

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "backfill-fundamentals.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const POLYGON_KEY = process.env.POLYGON_KEY;
if (!POLYGON_KEY) { console.error("❌ POLYGON_KEY not set"); process.exit(1); }

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

const QUARTERS = 8;            // last 8 quarters (2y of YoY context)
const RATE_DELAY_MS = 12_000;  // Polygon free tier: 5 req/min
const SKIP_THRESHOLD = QUARTERS; // skip a ticker that already has ≥8 rows

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

// Polygon's symbol convention for Berkshire is BRK.B (with the dot), same as
// our table; no mapping needed unlike AV/Yahoo.
function polygonSymbol(ticker) { return ticker; }

// Pull a single value from Polygon's nested {value, unit} accessors. Returns
// null when the field is missing or the response uses an alternate key.
function v(obj, ...keys) {
  for (const k of keys) {
    const node = obj?.[k];
    if (node && typeof node === "object" && Number.isFinite(node.value)) return node.value;
  }
  return null;
}

// Map Polygon's deeply-nested financials block into one flat row matching
// FUND_01_Quarterly's schema. Uses `end_date` as fiscal_period_ending —
// what the table indexes on and what `fetch-fundamentals.js` writes too.
function toRow(ticker, entry) {
  const f = entry?.financials || {};
  const is = f.income_statement || {};
  const bs = f.balance_sheet || {};
  const cf = f.cash_flow_statement || {};
  const fpe = entry?.end_date || null;
  if (!fpe) return null;
  return {
    ticker,
    fiscal_period_ending: fpe,
    // Income statement
    total_revenue:   v(is, "revenues"),
    gross_profit:    v(is, "gross_profit"),
    operating_income: v(is, "operating_income_loss"),
    net_income:      v(is, "net_income_loss"),
    rd_expense:      v(is, "research_and_development"),
    sga_expense:     v(is, "selling_general_and_administrative_expenses"),
    interest_expense: v(is, "interest_expense_operating", "interest_expense"),
    ebit:            null,
    ebitda:          null,
    // Balance sheet
    total_assets:    v(bs, "assets"),
    total_liabilities: v(bs, "liabilities"),
    total_equity:    v(bs, "equity"),
    current_assets:  v(bs, "current_assets"),
    current_liabilities: v(bs, "current_liabilities"),
    inventory:       v(bs, "inventory"),
    receivables:     v(bs, "accounts_receivable", "receivables"),
    cash_and_equivalents: v(bs, "cash"),
    short_term_debt: null,
    long_term_debt:  v(bs, "long_term_debt"),
    shares_outstanding: null,
    // Cash flow. Polygon's free-tier financials block doesn't split capex
    // out from the investing-activities total — leave capex null and let
    // capex-aware consumers fall back to AV's CASH_FLOW endpoint.
    cfo:             v(cf, "net_cash_flow_from_operating_activities"),
    capex:           null,
    cfi:             v(cf, "net_cash_flow_from_investing_activities"),
    cff:             v(cf, "net_cash_flow_from_financing_activities"),
    dividends_paid:  null,
    buyback:         null,
  };
}

async function existingRowCount(ticker) {
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data?.results || []);
    return rows.length;
  } catch { return 0; }
}

async function fetchPolygonFinancials(ticker) {
  const symbol = polygonSymbol(ticker);
  const url = `https://api.polygon.io/vX/reference/financials?ticker=${encodeURIComponent(symbol)}&limit=${QUARTERS}&timeframe=quarterly&order=desc&apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon ${ticker} → HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const j = await res.json();
  if (j?.status === "ERROR") throw new Error(`Polygon ${ticker}: ${j?.error || "unknown"}`);
  if (!Array.isArray(j?.results)) throw new Error(`Polygon ${ticker}: no results array`);
  return j.results;
}

async function postRows(rows) {
  const res = await fetch(`${INGEST_BASE}/ingest/fundamentals-quarterly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`ingest HTTP ${res.status}: ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return { ok: true, raw: txt }; }
}

(async () => {
  log(`backfill-fundamentals starting (${TICKERS.length} tickers, ${QUARTERS} quarters each)`);
  const summary = { total: TICKERS.length, fetched: 0, skipped: 0, errors: [] };

  for (let i = 0; i < TICKERS.length; i++) {
    const ticker = TICKERS[i];
    try {
      // Skip tickers that already have ≥QUARTERS rows. BRK.B and JPM are at 81;
      // re-running is wasteful and burns Polygon budget.
      const existing = await existingRowCount(ticker);
      if (existing >= SKIP_THRESHOLD) {
        log(`${ticker}: ${existing} rows already present — skip`);
        summary.skipped++;
        continue;
      }

      const entries = await fetchPolygonFinancials(ticker);
      const rows = entries.map(e => toRow(ticker, e)).filter(Boolean);
      if (rows.length === 0) {
        log(`${ticker}: Polygon returned 0 quarters`);
        summary.errors.push(`${ticker}: empty results`);
      } else {
        const ingestRes = await postRows(rows);
        log(`${ticker}: fetched ${rows.length} quarters, ingestor inserted ${ingestRes?.inserted ?? "?"}`);
        summary.fetched++;
      }
    } catch (err) {
      log(`${ticker}: ${err.message}`);
      summary.errors.push(`${ticker}: ${err.message}`);
    }

    // Throttle for next ticker (skip the trailing sleep on the last one).
    if (i < TICKERS.length - 1) await sleep(RATE_DELAY_MS);
  }

  log(`done. fetched=${summary.fetched} skipped=${summary.skipped} errors=${summary.errors.length}`);
  if (summary.errors.length > 0) {
    log(`error sample: ${summary.errors.slice(0, 5).join(" | ")}`);
  }
  process.exit(0);
})();
