/**
 * CONSENSUS-FETCHER — daily writer for FUND_03_Estimates.
 *
 * Per tracked ticker (sourced from PEER_SET_config), pulls FY / FY+1 / FY+2
 * sell-side consensus and upserts to FUND_03_Estimates. Drives Ticker
 * agent #3 (Estimates reading).
 *
 * Source: Alpha Vantage `EARNINGS_ESTIMATES` (free tier — 25 req/day shared
 * across all AV callers; gated by EARNINGS_CALENDAR_consensus to keep
 * steady-state usage to 3–8/day).
 *
 *   Earlier iterations tried Finnhub /stock/eps-estimate (premium-only,
 *   HTTP 403) and FMP /stable/analyst-estimates (free tier downgraded to
 *   HTTP 402 mid-2025). AV's EARNINGS_ESTIMATES is the only free endpoint
 *   that returns consensus PLUS 30-day net revision counts in one call.
 *
 * Endpoints:
 *   GET /build              — pull + upsert. Honours the gate.
 *   GET /build?force=1      — bypass gate (for one-shot backfill).
 *   GET /build?ticker=NVDA  — single-ticker probe (still honours gate
 *                              unless force=1 is also set).
 *   GET /status             — count + latest fiscal_year per ticker.
 *
 * Cron: 13:00 UTC weekdays only.
 *
 * Field mapping (AV → FUND_03_Estimates), per fiscal-year row:
 *   - eps_consensus       ← eps_estimate_average
 *   - rev_consensus       ← revenue_estimate_average
 *   - eps_dispersion      ← (eps_estimate_high − eps_estimate_low)
 *                            (range proxy; not a true stdev)
 *   - eps_revisions_30d   ← (revision_up_30d − revision_down_30d)
 *                            net integer count over trailing 30 days
 *   - rev_revisions_30d   ← NULL (AV doesn't publish revenue revision
 *                            counts; downstream readers should treat
 *                            NULL as "not available", not "zero")
 */

import { recordApiCall } from "../../_shared/api-usage.js";

const AV_BASE = "https://www.alphavantage.co/query";

// AV free tier is 25 req/day total. Sleep between calls so a burst from a
// force=1 backfill doesn't get short-rate-limited (separate from the daily
// cap — AV blocks rapid-fire bursts even within the daily budget).
const AV_THROTTLE_MS = 1200;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      const force = url.searchParams.get("force") === "1";
      const oneTicker = url.searchParams.get("ticker") || null;
      if (url.pathname === "/build")  return Response.json(await build(env, { force, oneTicker }));
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(build(env, {}).catch((e) => console.error(`[consensus] cron: ${e.message}`)));
  },
};

// Event-driven gate window. Refresh consensus only when:
//   today ≥ next_earnings_date − 7d   AND   today ≤ next_earnings_date + 2d
// (asymmetric: more lead-in than tail-out, since revisions move pre-print).
// Falls back to a 7-day staleness check if next_earnings_date is unknown.
const WINDOW_PRE_DAYS = 7;
const WINDOW_POST_DAYS = 2;
const STALENESS_DAYS = 7;

function daysBetween(a, b) {
  // a, b: YYYY-MM-DD strings. Returns signed integer days a−b.
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}

async function build(env, opts = {}) {
  const apiKey = env.ALPHAVANTAGE_KEY;
  if (!apiKey) throw new Error("ALPHAVANTAGE_KEY secret not set");

  const today = new Date().toISOString().slice(0, 10);
  const force = opts.force === true;

  // Source of truth for tracked tickers — bootstrapped in MS-1c. Avoids
  // hardcoding the ticker list in yet another worker.
  const { results: peerRows } = await env.DB.prepare(
    `SELECT ticker FROM PEER_SET_config ORDER BY ticker`,
  ).all();
  let tickers = (peerRows || []).map((r) => r.ticker);
  if (opts.oneTicker) tickers = tickers.filter(t => t === opts.oneTicker);
  if (tickers.length === 0) {
    return { ok: false, error: "PEER_SET_config is empty — run scripts/bootstrap-peer-set-config.js first" };
  }

  // Pre-load the earnings window per ticker and the latest FUND_03 write per
  // ticker so the gate is decided in-memory (one query each, not 25).
  const calRows = await env.DB.prepare(
    `SELECT ticker, next_earnings_date FROM EARNINGS_CALENDAR_consensus`
  ).all();
  const nextByTicker = new Map();
  for (const r of (calRows.results || [])) {
    if (r.next_earnings_date) nextByTicker.set(r.ticker, r.next_earnings_date);
  }

  const lastRows = await env.DB.prepare(
    `SELECT ticker, MAX(created_at) AS ts FROM FUND_03_Estimates GROUP BY ticker`
  ).all();
  const lastByTicker = new Map();
  for (const r of (lastRows.results || [])) {
    if (r.ts) lastByTicker.set(r.ticker, String(r.ts).slice(0, 10));
  }

  // Apply the gate. `skipped` is reported in the response so a sprint can
  // confirm the gate engaged.
  const skipped = [];
  const eligible = [];
  for (const t of tickers) {
    if (force) { eligible.push(t); continue; }
    const next = nextByTicker.get(t) || null;
    const last = lastByTicker.get(t) || null;
    const inWindow = next
      && daysBetween(today, next) >= -WINDOW_PRE_DAYS
      && daysBetween(today, next) <=  WINDOW_POST_DAYS;
    const tooStale = !last || daysBetween(today, last) > STALENESS_DAYS;
    if (inWindow || tooStale) {
      eligible.push(t);
    } else {
      skipped.push({ ticker: t, last, next });
      console.log(`[CONSENSUS] skip ${t} (last=${last || "never"}, next_earn=${next || "none"})`);
    }
  }

  if (eligible.length === 0) {
    return { ok: true, tickers: tickers.length, eligible: 0, skipped: skipped.length, inserted: 0, errors: [] };
  }

  let inserted = 0;
  const errors = [];

  // AV requires sequential calls — bursts get short-rate-limited even when
  // the per-day budget isn't exhausted.
  for (let i = 0; i < eligible.length; i++) {
    const ticker = eligible[i];
    const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
    try {
      const estimates = await fetchAvEstimates(apiKey, symbol, ticker);
      const fyRows = estimates.filter(r => r.horizon === "fiscal year");

      for (const r of fyRows) {
        const yr = r.date ? parseInt(String(r.date).slice(0, 4), 10) : null;
        if (!Number.isFinite(yr)) continue;

        const periodLabel = `FY${yr}`;
        const id = await shortHash(`${ticker}|annual|${periodLabel}`);

        const epsAvg  = num(r.eps_estimate_average);
        const epsHigh = num(r.eps_estimate_high);
        const epsLow  = num(r.eps_estimate_low);
        const revAvg  = num(r.revenue_estimate_average);

        const epsRevUp   = num(r.eps_estimate_revision_up_trailing_30_days);
        const epsRevDown = num(r.eps_estimate_revision_down_trailing_30_days);
        const epsRevisions30d = (epsRevUp != null || epsRevDown != null)
          ? Math.round((epsRevUp || 0) - (epsRevDown || 0))
          : null;

        const dispersion = (epsHigh != null && epsLow != null) ? epsHigh - epsLow : null;

        await env.DB.prepare(
          `INSERT INTO FUND_03_Estimates
             (id, ticker, period_label, period_kind, fiscal_year,
              eps_consensus, rev_consensus,
              eps_revisions_30d, rev_revisions_30d, eps_dispersion, source)
           VALUES (?, ?, ?, 'annual', ?, ?, ?, ?, ?, ?, 'av_earnings_estimates')
           ON CONFLICT(id) DO UPDATE SET
             eps_consensus      = excluded.eps_consensus,
             rev_consensus      = excluded.rev_consensus,
             eps_revisions_30d  = excluded.eps_revisions_30d,
             rev_revisions_30d  = excluded.rev_revisions_30d,
             eps_dispersion     = excluded.eps_dispersion,
             source             = excluded.source`,
        ).bind(
          id, ticker, periodLabel, yr,
          epsAvg, revAvg,
          epsRevisions30d,
          null,           // rev_revisions_30d — AV doesn't publish revenue revision counts
          dispersion,
        ).run();
        inserted++;
      }
      console.log(`AV_BUDGET ${today} EARNINGS_ESTIMATES ${ticker} ok`);
      await recordApiCall({ env, caller: "consensus-fetcher", api: "alphavantage", endpoint: "EARNINGS_ESTIMATES", calls: 1, ok: true });
    } catch (err) {
      console.log(`AV_BUDGET ${today} EARNINGS_ESTIMATES ${ticker} fail`);
      await recordApiCall({ env, caller: "consensus-fetcher", api: "alphavantage", endpoint: "EARNINGS_ESTIMATES", calls: 1, ok: false });
      errors.push(`${ticker}: ${err.message}`);
    }

    if (i < eligible.length - 1) {
      await new Promise(r => setTimeout(r, AV_THROTTLE_MS));
    }
  }

  return {
    ok: true,
    tickers: tickers.length,
    eligible: eligible.length,
    skipped: skipped.length,
    skipped_sample: skipped.slice(0, 5),
    inserted,
    errors,
  };
}

function num(v) {
  if (v == null || v === "" || v === "None") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            COUNT(DISTINCT ticker) AS tickers,
            MIN(fiscal_year) AS min_year,
            MAX(fiscal_year) AS max_year
       FROM FUND_03_Estimates`,
  ).first();
  return { ok: true, ...summary };
}

async function fetchAvEstimates(apiKey, symbol, ticker) {
  const url = `${AV_BASE}?function=EARNINGS_ESTIMATES&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AV ${ticker} → HTTP ${res.status}`);
  const j = await res.json();
  // AV returns rate-limit / error envelopes as { Information } / { Note } /
  // { "Error Message" } instead of throwing — surface those as exceptions
  // so the caller logs them under the AV_BUDGET trail.
  if (j?.Information) throw new Error(`AV rate-limit ${ticker}: ${String(j.Information).slice(0, 160)}`);
  if (j?.Note) throw new Error(`AV note ${ticker}: ${String(j.Note).slice(0, 160)}`);
  if (j?.["Error Message"]) throw new Error(`AV error ${ticker}: ${String(j["Error Message"]).slice(0, 160)}`);
  if (!Array.isArray(j?.estimates)) {
    throw new Error(`AV ${ticker}: missing estimates[] in response`);
  }
  return j.estimates;
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
