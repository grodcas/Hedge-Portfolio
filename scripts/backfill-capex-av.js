// scripts/backfill-capex-av.js
//
// Polygon's free-tier /vX/reference/financials doesn't split capex out from
// the investing-activities total — that's why backfill-fundamentals.js leaves
// capex NULL for most tickers and FCF (cfo - capex) is unfillable downstream.
// Alpha Vantage's CASH_FLOW function does expose `capitalExpenditures`
// directly, so this script does a focused capex-only patch.
//
// Per ticker: GET CASH_FLOW → take quarterlyReports[0..7].fiscalDateEnding +
// capitalExpenditures, POST to /ingest/fundamentals-quarterly with just
// { ticker, fiscal_period_ending, capex } per quarter. Every other field is
// null; the ingestor's COALESCE-based UPSERT preserves the existing values
// (revenue, operating_income, cfo, balance-sheet items, etc.) and only fills
// in capex where it was previously NULL.
//
// AV free tier: 5 req/min, 25 req/day. 25 tickers × 12s ≈ 5 min wall-clock.
// Idempotent. Re-running is safe — UPSERT keeps existing capex values intact.
//
// Usage: node scripts/backfill-capex-av.js
// Logs:  logs/backfill-capex-av.log

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "backfill-capex-av.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const AV_KEY = process.env.ALPHAVANTAGE_KEY;
if (!AV_KEY) { console.error("ALPHAVANTAGE_KEY not set"); process.exit(1); }

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

const QUARTERS = 8;
const RATE_DELAY_MS = 12_000;     // 5 req/min on AV free tier

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

// AV uses BRK-B (with a hyphen) for Berkshire B; Polygon uses BRK.B (with a dot).
// Our DB uses BRK.B as the canonical ticker — translate when calling AV.
function avSymbol(ticker) {
  return ticker === "BRK.B" ? "BRK-B" : ticker;
}

async function fetchAvCashflow(ticker) {
  const url = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${encodeURIComponent(avSymbol(ticker))}&apikey=${AV_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AV ${ticker} → HTTP ${res.status}`);
  const j = await res.json();
  if (j?.Note || j?.Information) {
    throw new Error(`AV ${ticker} throttled: ${(j.Note || j.Information).slice(0, 120)}`);
  }
  const reports = Array.isArray(j?.quarterlyReports) ? j.quarterlyReports : [];
  if (reports.length === 0) throw new Error(`AV ${ticker}: no quarterlyReports`);
  return reports;
}

// AV reports capex against calendar quarter-ends (e.g. 2026-03-31), but
// Polygon (which seeds the rest of FUND_01_Quarterly) writes against each
// ticker's actual fiscal calendar (e.g. AAPL ends 2026-03-28, NVDA ends
// 2026-01-25). If we POST AV's date verbatim, the UPSERT creates a *second*
// row per quarter — one with cfo, one with capex — and the FCF math fails.
// Snap AV's date to the closest existing Polygon date within ±15 days; only
// fall back to AV's date if there's no nearby match.
async function fetchExistingDates(ticker) {
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals-quarterly?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data?.results || []);
    return rows.map(r => r.fiscal_period_ending).filter(Boolean);
  } catch { return []; }
}
function snapDate(avDate, existingDates) {
  const target = Date.parse(avDate);
  if (!Number.isFinite(target) || existingDates.length === 0) return avDate;
  let best = null, bestDiff = Infinity;
  for (const d of existingDates) {
    const diff = Math.abs(Date.parse(d) - target);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  // 15-day window — comfortably covers both calendar-quarter offsets and
  // 4-4-5 retail fiscal calendars without bleeding into adjacent quarters.
  return (best && bestDiff <= 15 * 24 * 3600 * 1000) ? best : avDate;
}

function toCapexRows(ticker, reports, existingDates) {
  const rows = [];
  for (const r of reports.slice(0, QUARTERS)) {
    const fpe = r?.fiscalDateEnding;
    if (!fpe) continue;
    const raw = r?.capitalExpenditures;
    const capex = (raw && raw !== "None") ? Number(raw) : null;
    if (capex == null || !Number.isFinite(capex)) continue;
    rows.push({ ticker, fiscal_period_ending: snapDate(fpe, existingDates), capex });
  }
  return rows;
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
  log(`backfill-capex-av starting (${TICKERS.length} tickers, last ${QUARTERS} quarters)`);
  const summary = { fetched: 0, written: 0, errors: [] };

  for (let i = 0; i < TICKERS.length; i++) {
    const ticker = TICKERS[i];
    try {
      const [reports, existingDates] = await Promise.all([
        fetchAvCashflow(ticker),
        fetchExistingDates(ticker),
      ]);
      const rows = toCapexRows(ticker, reports, existingDates);
      if (rows.length === 0) {
        log(`${ticker}: no capex values found in last ${QUARTERS}q`);
        summary.errors.push(`${ticker}: empty capex`);
      } else {
        await postRows(rows);
        log(`${ticker}: patched ${rows.length} quarters of capex (most recent: ${rows[0].fiscal_period_ending} = $${(rows[0].capex/1e6).toFixed(0)}M)`);
        summary.fetched++;
        summary.written += rows.length;
      }
    } catch (err) {
      log(`${ticker}: ${err.message}`);
      summary.errors.push(`${ticker}: ${err.message}`);
    }
    if (i < TICKERS.length - 1) await sleep(RATE_DELAY_MS);
  }

  log(`done. tickers=${summary.fetched} rows=${summary.written} errors=${summary.errors.length}`);
  if (summary.errors.length) {
    log(`error sample: ${summary.errors.slice(0, 3).join(" | ")}`);
  }
  process.exit(0);
})();
