// workers/_shared/api-usage.js
//
// Canonical per-call API usage logger. One worker calls `recordApiCall()`
// after a successful (or failed) outbound API call; this aggregates by
// (run_date, caller, api, endpoint) and bumps PROC_04_API_usage's counters.
//
// Two write paths:
//   - DIRECT: pass `env` with a `DB` binding → write straight to D1.
//   - HTTP:   pass `ingestorUrl` (a string) → POST to /ingest/api-usage
//             on portfolio-ingestor. Used by callers that don't have D1
//             bound (e.g. the laptop pipeline's fetch-fundamentals.js).
//
// Always logs the canonical "API_USAGE …" line to console regardless of
// path so a pipeline log grep ("AV_BUDGET|API_USAGE") sees both today's
// AV daily budget and the broader cost view.
//
// Usage:
//   import { recordApiCall } from "../_shared/api-usage.js";
//   await recordApiCall({ env, caller: "consensus-fetcher", api: "alphavantage",
//                         endpoint: "EARNINGS_ESTIMATES", calls: 1, ok: true });

// Per-call cost estimates (USD). Tune as model prices change. The defaults
// fall through to "default" key if the endpoint isn't listed explicitly.
// Numbers are intentionally approximate — the goal is "is today $1 or $50?",
// not a billing-grade ledger.
const COST_PER_CALL = {
  alphavantage: { default: 0 },
  polygon:      { default: 0 },
  finnhub:      { default: 0 },
  fred:         { default: 0 },
  yahoo:        { default: 0 },
  sec:          { default: 0 },
  openai: {
    "gpt-5":          0.012,
    "gpt-5-mini":     0.0008,
    "gpt-4o-mini":    0.0003,
    "gpt-4.1-mini":   0.0006,
    default:          0.005,
  },
  gemini: {
    "gemini-2.5-flash":          0.0005,
    "gemini-2.5-flash:grounded": 0.035,
    default:                     0.0005,
  },
};

const BUDGET_CAP = {
  alphavantage: 25, // free tier daily ceiling — drives the headroom badge
};

function costFor(api, endpoint, calls) {
  const family = COST_PER_CALL[api];
  if (!family) return 0;
  const key = endpoint && family[endpoint] !== undefined ? endpoint : "default";
  return (family[key] ?? 0) * calls;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record one API call (or batch of calls) against PROC_04_API_usage.
 *
 * Required:
 *   caller   — short string identifying the worker / script.
 *   api      — vendor: 'alphavantage' | 'openai' | 'gemini' | ...
 *
 * Optional:
 *   endpoint — sub-resource ('EARNINGS_ESTIMATES', 'gpt-5', ...). Default ''.
 *   calls    — count. Default 1.
 *   ok       — currently informational; both ok and fail count toward usage.
 *   env      — Cloudflare worker env with DB binding (DIRECT path).
 *   ingestorUrl — base URL of portfolio-ingestor (HTTP path).
 *
 * Returns: { ok, path: 'direct' | 'http' | 'log-only', error? }
 */
export async function recordApiCall({ env, ingestorUrl, caller, api, endpoint = "", calls = 1, ok = true }) {
  if (!caller || !api) {
    return { ok: false, error: "recordApiCall: caller + api required" };
  }
  const today = todayISO();
  const cost  = costFor(api, endpoint, calls);
  const cap   = BUDGET_CAP[api] ?? null;

  console.log(`API_USAGE ${today} ${caller} ${api}/${endpoint || "default"} +${calls} cost≈$${cost.toFixed(4)} ${ok ? "ok" : "fail"}`);

  if (env?.DB?.prepare) {
    try {
      await env.DB.prepare(`
        INSERT INTO PROC_04_API_usage
          (run_date, caller, api, endpoint, calls, cost_usd, budget_cap, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_date, caller, api, endpoint) DO UPDATE SET
          calls       = calls + excluded.calls,
          cost_usd    = COALESCE(cost_usd, 0) + excluded.cost_usd,
          budget_cap  = COALESCE(budget_cap, excluded.budget_cap),
          updated_at  = excluded.updated_at
      `).bind(today, caller, api, endpoint, calls, cost, cap, new Date().toISOString()).run();
      return { ok: true, path: "direct" };
    } catch (err) {
      console.error(`api-usage direct write failed (${caller}/${api}): ${err.message}`);
      // Fall through to HTTP path or log-only.
    }
  }

  if (ingestorUrl) {
    try {
      const res = await fetch(`${ingestorUrl}/ingest/api-usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller, api, endpoint, calls, cost_usd: cost, budget_cap: cap }),
      });
      if (res.ok) return { ok: true, path: "http" };
      const txt = await res.text().catch(() => "");
      return { ok: false, path: "http", error: `HTTP ${res.status}: ${txt.slice(0, 160)}` };
    } catch (err) {
      return { ok: false, path: "http", error: err.message };
    }
  }

  return { ok: true, path: "log-only" };
}
