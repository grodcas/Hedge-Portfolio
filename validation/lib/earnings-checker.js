// validation/lib/earnings-checker.js — Validates FUND_02 + FUND_03 freshness
import { PORTFOLIO_TICKERS } from "../config.js";

const WORKER_API = process.env.WORKER_API || "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

async function checkEarnings() {
  try {
    const [earningsRes, recsRes] = await Promise.all([
      fetch(`${WORKER_API}/query/earnings`),
      fetch(`${WORKER_API}/query/recommendations`),
    ]);

    if (!earningsRes.ok || !recsRes.ok) {
      return { valid: false, error: `HTTP earnings=${earningsRes.status}, recs=${recsRes.status}`, details: {} };
    }

    const earnings = await earningsRes.json();
    const recs = await recsRes.json();

    const earningsTickers = new Set(earnings.map(r => r.ticker));
    const recsTickers = new Set(recs.map(r => r.ticker));

    const missingEarnings = PORTFOLIO_TICKERS.filter(t => !earningsTickers.has(t));
    const missingRecs = PORTFOLIO_TICKERS.filter(t => !recsTickers.has(t));

    // Validate recs counts sum > 0
    const zeroRecs = recs.filter(r => {
      const total = (r.strong_buy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strong_sell || 0);
      return total === 0;
    });

    // Validate surprise_pct is reasonable
    const weirdSurprise = earnings.filter(e => e.surprise_pct != null && (e.surprise_pct < -100 || e.surprise_pct > 200));

    const valid = missingEarnings.length === 0 && missingRecs.length === 0 && zeroRecs.length === 0 && weirdSurprise.length === 0;

    return {
      valid,
      details: {
        earnings_count: earnings.length,
        recs_count: recs.length,
        missing_earnings: missingEarnings,
        missing_recs: missingRecs,
        zero_recs: zeroRecs.map(r => r.ticker),
        weird_surprise: weirdSurprise.map(e => `${e.ticker}:${e.surprise_pct}`),
      },
    };
  } catch (err) {
    return { valid: false, error: err.message, details: {} };
  }
}

function getSummary(result) {
  if (!result) return { passed: 0, total: 0, issues: [] };
  const issues = [];
  if (result.details?.missing_earnings?.length) {
    issues.push(`No earnings: ${result.details.missing_earnings.slice(0, 5).join(", ")}`);
  }
  if (result.details?.missing_recs?.length) {
    issues.push(`No recs: ${result.details.missing_recs.slice(0, 5).join(", ")}`);
  }
  if (result.details?.zero_recs?.length) {
    issues.push(`Zero analyst recs: ${result.details.zero_recs.join(", ")}`);
  }
  return {
    passed: result.valid ? 1 : 0,
    total: 1,
    issues,
  };
}

export { checkEarnings, getSummary };
