// validation/lib/sec_checker.js - Simple SEC EDGAR checker
// Queries SEC API directly to verify filings for portfolio tickers

import axios from "axios";
import { TICKER_CIK, PORTFOLIO_TICKERS, SEC_FILING_TYPES } from "../config.js";

const SEC_BASE_URL = "https://data.sec.gov/submissions";
const USER_AGENT = "HF Trading Journal validation@example.com";

// Throttle to respect SEC rate limits (10 req/sec)
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // SEC dates are YYYY-MM-DD
  return dateStr;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch recent filings for a single ticker from SEC EDGAR
 * @param {string} ticker - Stock ticker symbol
 * @param {number} lookbackDays - Number of days to look back (default 2)
 * @returns {Promise<Object>} - { ticker, filings: [{type, date, accession}], error }
 */
async function checkTickerFilings(ticker, lookbackDays = 2) {
  const cik = TICKER_CIK[ticker];
  if (!cik) {
    return { ticker, filings: [], error: `Unknown CIK for ${ticker}` };
  }

  try {
    const url = `${SEC_BASE_URL}/CIK${cik}.json`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const filings = [];
    const recent = data.filings?.recent;

    if (recent && recent.form && recent.filingDate && recent.accessionNumber) {
      for (let i = 0; i < recent.form.length; i++) {
        const form = recent.form[i];
        const date = recent.filingDate[i];
        const accession = recent.accessionNumber[i];

        // Only include relevant form types
        if (!SEC_FILING_TYPES.includes(form)) continue;

        // Only include recent filings
        if (date < cutoffStr) break; // Sorted newest first, so we can stop

        filings.push({
          type: form,
          date,
          accession
        });
      }
    }

    return { ticker, filings, error: null };
  } catch (err) {
    return { ticker, filings: [], error: err.message };
  }
}

/**
 * Check all portfolio tickers for recent SEC filings
 * @param {number} lookbackDays - Number of days to look back
 * @param {Function} onProgress - Callback for progress updates (ticker, index, total)
 * @returns {Promise<Object>} - { results: {ticker: filings[]}, errors: {ticker: error} }
 */
async function checkAllTickers(lookbackDays = 2, onProgress = null) {
  const results = {};
  const errors = {};

  for (let i = 0; i < PORTFOLIO_TICKERS.length; i++) {
    const ticker = PORTFOLIO_TICKERS[i];

    if (onProgress) {
      onProgress(ticker, i, PORTFOLIO_TICKERS.length);
    }

    const { filings, error } = await checkTickerFilings(ticker, lookbackDays);

    if (error) {
      errors[ticker] = error;
    } else {
      results[ticker] = filings;
    }

    // Throttle to avoid hitting rate limits
    await delay(150);
  }

  return { results, errors };
}

/**
 * Compare SEC check results with what was ingested
 * @param {Object} secResults - Results from checkAllTickers
 * @param {Object} ingestedData - Data from ingestion pipeline
 * @returns {Array} - Comparison results for each ticker
 */
function compareWithIngested(secResults, ingestedData) {
  const comparison = [];

  for (const ticker of PORTFOLIO_TICKERS) {
    const secFilings = secResults.results[ticker] || [];
    const ingested = ingestedData[ticker] || [];

    // Compare by UNIQUE filing types (not individual filing counts)
    // Multiple Form 4s on the same day are normal insider transactions
    const secUniqueTypes = [...new Set(secFilings.map(f => f.type))].sort();
    const ingestedUniqueTypes = [...new Set(ingested.map(f => f.type))].sort();

    const secDisplay = secUniqueTypes.join(",") || "-";
    const ingestedDisplay = ingestedUniqueTypes.join(",") || "-";
    const match = secDisplay === ingestedDisplay;

    comparison.push({
      ticker,
      secCheck: secDisplay,
      ingestor: ingestedDisplay,
      match,
      newFilings: secDisplay,
      secFilings,
      ingestedFilings: ingested
    });
  }

  return comparison;
}

/**
 * Get summary of today's filings across all tickers
 * @param {Object} secResults - Results from checkAllTickers
 * @returns {Object} - Summary stats
 */
function getSummary(secResults) {
  const today = todayISO();
  const yesterday = yesterdayISO();

  let totalFilings = 0;
  let todayFilings = 0;
  let yesterdayFilings = 0;
  const byType = { "10-K": 0, "10-Q": 0, "8-K": 0, "4": 0 };

  for (const ticker of Object.keys(secResults.results)) {
    const filings = secResults.results[ticker];
    totalFilings += filings.length;

    for (const f of filings) {
      if (f.date === today) todayFilings++;
      if (f.date === yesterday) yesterdayFilings++;
      if (byType.hasOwnProperty(f.type)) byType[f.type]++;
    }
  }

  return {
    totalFilings,
    todayFilings,
    yesterdayFilings,
    byType,
    errors: Object.keys(secResults.errors).length
  };
}

export {
  checkTickerFilings,
  checkAllTickers,
  compareWithIngested,
  getSummary,
  todayISO,
  yesterdayISO
};
