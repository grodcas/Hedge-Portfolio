// validation/lib/sec_ingest_scanner.js
// Scans local edgar folders to find what SEC filings have been ingested

import fs from "fs";
import path from "path";
import { PORTFOLIO_TICKERS, SEC_FILING_TYPES } from "../config.js";

const EDGAR_PARSED_DIR = "C:\\AI_agent\\HF\\edgar\\edgar_parsed_json";
const EDGAR_RAW_DIR = "C:\\AI_agent\\HF\\edgar\\edgar_raw_html";

/**
 * Scan edgar folders to find all ingested SEC filings
 * @param {number} lookbackDays - Only include filings from last N days (0 = all)
 * @returns {Object} - { TICKER: [{ type, date, accession? }], ... }
 */
function scanIngestedFilings(lookbackDays = 0) {
  const result = {};

  // Initialize all portfolio tickers with empty arrays
  for (const ticker of PORTFOLIO_TICKERS) {
    result[ticker] = [];
  }

  // Calculate cutoff date if lookbackDays specified
  let cutoffDate = null;
  if (lookbackDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    cutoffDate = cutoff.toISOString().slice(0, 10);
  }

  // Scan parsed JSON folder (preferred - has more metadata)
  if (fs.existsSync(EDGAR_PARSED_DIR)) {
    const files = fs.readdirSync(EDGAR_PARSED_DIR);

    for (const file of files) {
      // Pattern: TICKER_TYPE_DATE_parsed.json or TICKER_TYPE_DATE_itemX.json
      const match = file.match(/^([A-Z.]+)_(10-K|10-Q|8-K|4)_(\d{4}-\d{2}-\d{2})(?:_.*)?\.json$/);
      if (!match) continue;

      const [, ticker, type, date] = match;

      // Skip if not a portfolio ticker
      if (!PORTFOLIO_TICKERS.includes(ticker)) continue;

      // Skip if outside lookback window
      if (cutoffDate && date < cutoffDate) continue;

      // Skip if not a tracked filing type
      if (!SEC_FILING_TYPES.includes(type)) continue;

      // Avoid duplicates (same ticker+type+date)
      const exists = result[ticker].some(f => f.type === type && f.date === date);
      if (!exists) {
        result[ticker].push({ type, date, source: "parsed_json" });
      }
    }
  }

  // Also scan raw HTML folder as fallback
  if (fs.existsSync(EDGAR_RAW_DIR)) {
    const files = fs.readdirSync(EDGAR_RAW_DIR);

    for (const file of files) {
      // Pattern: TICKER_TYPE_DATE.html
      const match = file.match(/^([A-Z.]+)_(10-K|10-Q|8-K|4)_(\d{4}-\d{2}-\d{2})\.html$/);
      if (!match) continue;

      const [, ticker, type, date] = match;

      if (!PORTFOLIO_TICKERS.includes(ticker)) continue;
      if (cutoffDate && date < cutoffDate) continue;
      if (!SEC_FILING_TYPES.includes(type)) continue;

      // Avoid duplicates
      const exists = result[ticker].some(f => f.type === type && f.date === date);
      if (!exists) {
        result[ticker].push({ type, date, source: "raw_html" });
      }
    }
  }

  // Sort filings by date (newest first) for each ticker
  for (const ticker of Object.keys(result)) {
    result[ticker].sort((a, b) => b.date.localeCompare(a.date));
  }

  return result;
}

/**
 * Get summary of ingested filings
 * @param {Object} ingestedData - Output from scanIngestedFilings
 * @returns {Object} - Summary statistics
 */
function getIngestedSummary(ingestedData) {
  let totalFilings = 0;
  const byType = { "10-K": 0, "10-Q": 0, "8-K": 0, "4": 0 };
  const tickersWithFilings = [];

  for (const [ticker, filings] of Object.entries(ingestedData)) {
    totalFilings += filings.length;
    if (filings.length > 0) {
      tickersWithFilings.push(ticker);
    }
    for (const f of filings) {
      if (byType.hasOwnProperty(f.type)) {
        byType[f.type]++;
      }
    }
  }

  return {
    totalFilings,
    byType,
    tickersWithFilings,
    tickerCount: tickersWithFilings.length
  };
}

/**
 * Get only recent filings (for validation comparison)
 * @param {number} lookbackDays - Days to look back (default 2)
 * @returns {Object} - Ingested filings in last N days
 */
function getRecentIngestedFilings(lookbackDays = 2) {
  return scanIngestedFilings(lookbackDays);
}

export {
  scanIngestedFilings,
  getIngestedSummary,
  getRecentIngestedFilings,
  EDGAR_PARSED_DIR,
  EDGAR_RAW_DIR
};
