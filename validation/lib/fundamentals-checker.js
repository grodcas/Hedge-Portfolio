// validation/lib/fundamentals-checker.js — Validates FUND_01_Fundamentals values
import { PORTFOLIO_TICKERS } from "../config.js";

const WORKER_API = process.env.WORKER_API || "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

async function checkFundamentals() {
  try {
    const res = await fetch(`${WORKER_API}/query/fundamentals`);
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}`, details: {} };

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: "No fundamentals data", details: { count: 0 } };
    }

    const tickerSet = new Set(rows.map(r => r.ticker));
    const missing = PORTFOLIO_TICKERS.filter(t => !tickerSet.has(t));

    // Validate ranges
    const outOfRange = [];
    for (const r of rows) {
      if (r.pe_ratio != null && (r.pe_ratio < 0 || r.pe_ratio > 500)) {
        outOfRange.push(`${r.ticker}: P/E ${r.pe_ratio}`);
      }
      if (r.market_cap != null && r.market_cap <= 0) {
        outOfRange.push(`${r.ticker}: market_cap ${r.market_cap}`);
      }
    }

    const valid = missing.length === 0 && outOfRange.length === 0;

    return {
      valid,
      count: rows.length,
      details: {
        total: rows.length,
        missing_tickers: missing,
        out_of_range: outOfRange,
      },
    };
  } catch (err) {
    return { valid: false, error: err.message, details: {} };
  }
}

function getSummary(result) {
  if (!result) return { passed: 0, total: 0, issues: [] };
  const issues = [];
  if (result.details?.missing_tickers?.length) {
    issues.push(`Missing fundamentals: ${result.details.missing_tickers.join(", ")}`);
  }
  if (result.details?.out_of_range?.length) {
    issues.push(`Out of range: ${result.details.out_of_range.slice(0, 3).join("; ")}`);
  }
  return {
    passed: result.valid ? 1 : 0,
    total: 1,
    issues,
  };
}

export { checkFundamentals, getSummary };
