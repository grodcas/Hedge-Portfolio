// scripts/scrape-ssga-pe.js
//
// Monthly SSGA sector-ETF fact-sheet scraper. Downloads 8 PDFs, extracts
// forward P/E + dividend yield + 3-5y EPS growth, POSTs to the ingestor's
// /ingest/sector-valuation endpoint.
//
// URL pattern: https://www.ssga.com/library-content/products/factsheets/etfs/emea/factsheet-emea-en_gb-<etf>.pdf
// Cadence: monthly (PDF "As of" date is month-end); script is idempotent.
//
// Usage: node scripts/scrape-ssga-pe.js
// Logs:  logs/scrape-ssga-pe.log

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "scrape-ssga-pe.log");

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

// ETF → backend sector bucket (matches SECTOR_FACTORS_daily.sector values)
const SECTOR_ETFS = [
  ["XLK", "Technology"],
  ["XLV", "Healthcare"],
  ["XLF", "Finance"],
  ["XLE", "Energy"],
  ["XLP", "Staples"],
  ["XLI", "Industrial"],
  ["XLY", "ConsDisc"],
  ["XLC", "Communication"],
];

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

function parseAsOfDate(text) {
  // "As of 03/31/2026" → "2026-03-31"
  const m = text.match(/As of\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseNumber(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function fetchPdf(etf) {
  const url = `https://www.ssga.com/library-content/products/factsheets/etfs/emea/factsheet-emea-en_gb-${etf.toLowerCase()}.pdf`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${etf}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function parsePdf(buf) {
  // pdf-parse v2 API: new PDFParse({data}).getText() → { text }
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function main() {
  log(`Scraping ${SECTOR_ETFS.length} SSGA sector fact sheets`);
  const rows = [];
  for (const [etf, bucket] of SECTOR_ETFS) {
    try {
      const buf = await fetchPdf(etf);
      const text = await parsePdf(buf);
      const asOf = parseAsOfDate(text);
      const fwdPe = parseNumber(text, /Price\/Earnings Ratio FY1\s+([\d.]+)/);
      const divYield = parseNumber(text, /Index Dividend Yield\s+([\d.]+)%/);
      const epsGrowth = parseNumber(text, /Est\.\s*3-5 Year EPS Growth\s+([\d.]+)%/);
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      if (!asOf || fwdPe == null) {
        log(`  ${etf}: ❌ failed to parse (asOf=${asOf}, fwdPe=${fwdPe})`);
        continue;
      }
      rows.push({
        etf_ticker: etf,
        sector_bucket: bucket,
        date: asOf,
        forward_pe: fwdPe,
        div_yield: divYield,
        est_eps_growth_3_5y: epsGrowth,
        raw_pdf_hash: hash,
      });
      log(`  ${etf} (${bucket}) asOf=${asOf}: fwd P/E=${fwdPe}, div=${divYield}%, growth=${epsGrowth}%`);
    } catch (err) {
      log(`  ${etf}: ❌ ${err.message}`);
    }
  }

  if (rows.length === 0) {
    log("No rows to ingest — aborting");
    process.exit(1);
  }

  const res = await fetch(`${INGEST_BASE}/ingest/sector-valuation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    log(`Ingest failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const out = await res.json();
  log(`\nIngested ${out.inserted} rows`);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
