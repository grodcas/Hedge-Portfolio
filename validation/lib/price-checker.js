// validation/lib/price-checker.js — Validates PRICE_01_Daily has current data
import { PORTFOLIO_TICKERS } from "../config.js";

const WORKER_API = process.env.WORKER_API || "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const REQUIRED_ETFS = ["SPY", "XLK", "XLF", "XLE", "XLV", "XLP", "XLI"];

async function checkPrices() {
  try {
    const res = await fetch(`${WORKER_API}/query/prices`);
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}`, details: {} };

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: "No price data", details: { count: 0 } };
    }

    const tickerSet = new Set(rows.map(r => r.ticker));
    const missingTickers = PORTFOLIO_TICKERS.filter(t => !tickerSet.has(t));
    const missingEtfs = REQUIRED_ETFS.filter(e => !tickerSet.has(e));

    // Verify OHLCV values look reasonable
    const bad = rows.filter(r => !r.close || r.close <= 0 || !r.volume || r.volume < 0);

    const valid = missingTickers.length === 0 && missingEtfs.length === 0 && bad.length === 0;

    return {
      valid,
      date: rows[0]?.date,
      count: rows.length,
      details: {
        total: rows.length,
        missing_tickers: missingTickers,
        missing_etfs: missingEtfs,
        bad_values: bad.length,
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
    issues.push(`Missing tickers: ${result.details.missing_tickers.join(", ")}`);
  }
  if (result.details?.missing_etfs?.length) {
    issues.push(`Missing ETFs: ${result.details.missing_etfs.join(", ")}`);
  }
  if (result.details?.bad_values) {
    issues.push(`${result.details.bad_values} rows with invalid OHLCV`);
  }
  return {
    passed: result.valid ? 1 : 0,
    total: 1,
    issues,
  };
}

export { checkPrices, getSummary };
