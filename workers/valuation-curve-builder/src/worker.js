import { openaiFetch } from "../../_shared/openai-call.js";
/**
 * VALUATION-CURVE-BUILDER — Sprint 12
 *
 * Produces two valuation curves per ticker, in absolute $:
 *
 *  SHORT curve (Mode 1): tactical fair value, price-blind LLM.
 *    Re-computed on news/press/revision events. The LLM does NOT see the
 *    stock price — it must derive fair value from fundamental anchors +
 *    recent event stack, adjusted against the most recent LONG baseline.
 *
 *  LONG curve (Mode 2): structural fair value, price-aware LLM with
 *    anchor-independence constraint. Triggered by bimonthly floor (60d) or
 *    structural events (earnings / 10-K / 10-Q / FOMC). LLM receives the
 *    price as one input labelled "market's current opinion"; the prompt
 *    explicitly forbids deriving fair value from price. Between reviews,
 *    the long curve is flat (step function).
 *
 *  REALIZED (Mode R): /realize pass tracks convergence — did the market
 *    price move toward the fair-value curves over a 21d window? Builds the
 *    calibration track record.
 *
 * Why the dual-mode split: see NARRATIVE_PHASE_2_PLAN § Sprint 12 discussion.
 * The short curve is price-blind to avoid anchoring bias (model rubber-bands
 * to price). The long curve sees price but only to articulate deviation,
 * under explicit constraints.
 *
 * Endpoints:
 *   GET /short?ticker=X[&force=1]   — run Mode 1 for one ticker
 *   GET /long?ticker=X[&force=1]    — run Mode 2 for one ticker
 *   GET /build-all?mode=short|long  — batch across all 25 tickers
 *   GET /realize                    — run calibration pass (write REALIZED rows)
 *   GET /status                     — per-ticker latest {short, long, last_review}
 *
 * Crons:
 *   15 1 * * *  — daily short sweep (catch event impact within 24h)
 *   30 1 * * *  — daily long check (fire any ticker past 60-day floor)
 */

const TRACKED_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

const LONG_REVIEW_FLOOR_DAYS = 60; // Mode 2 minimum cadence

// =========================================================================
// DISPATCH
// =========================================================================

export default {
  async fetch(req, env) {
    globalThis.__OAI_CTX = { env, caller: "valuation-curve-builder" };
    const url = new URL(req.url);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    try {
      if (url.pathname === "/short") {
        const ticker = url.searchParams.get("ticker");
        if (!ticker) return Response.json({ ok: false, error: "ticker required" }, { status: 400 });
        const force = url.searchParams.get("force") === "1";
        return Response.json(await runShort({ env, apiKey, ticker, force }));
      }
      if (url.pathname === "/long") {
        const ticker = url.searchParams.get("ticker");
        if (!ticker) return Response.json({ ok: false, error: "ticker required" }, { status: 400 });
        const force = url.searchParams.get("force") === "1";
        const trigger = url.searchParams.get("trigger") || "manual";
        return Response.json(await runLong({ env, apiKey, ticker, force, trigger }));
      }
      if (url.pathname === "/build-all") {
        const mode = url.searchParams.get("mode") || "short";
        return Response.json(await buildAll({ env, apiKey, mode }));
      }
      if (url.pathname === "/realize") {
        return Response.json(await realize({ env }));
      }
      if (url.pathname === "/status") {
        return Response.json(await status({ env }));
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    globalThis.__OAI_CTX = { env, caller: "valuation-curve-builder" };
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return;
    // 15 past the hour = short sweep. 30 past the hour = long auto-review.
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    if (minute === 15) {
      ctx.waitUntil(buildAll({ env, apiKey, mode: "short" }).catch((e) => console.error(`[val] cron short: ${e.message}`)));
    } else {
      ctx.waitUntil(buildAll({ env, apiKey, mode: "long_auto" }).catch((e) => console.error(`[val] cron long: ${e.message}`)));
    }
  },
};

// =========================================================================
// BATCH
// =========================================================================

async function buildAll({ env, apiKey, mode }) {
  const results = [];
  for (const ticker of TRACKED_TICKERS) {
    try {
      if (mode === "short") {
        results.push({ ticker, ...(await runShort({ env, apiKey, ticker, force: false })) });
      } else if (mode === "long") {
        results.push({ ticker, ...(await runLong({ env, apiKey, ticker, force: true, trigger: "manual_batch" })) });
      } else if (mode === "long_auto") {
        // Only fire long review for tickers past the 60-day floor.
        const last = await latestLong(env.DB, ticker);
        const daysOld = last?.as_of ? daysSince(last.as_of) : Infinity;
        if (daysOld >= LONG_REVIEW_FLOOR_DAYS) {
          results.push({ ticker, ...(await runLong({ env, apiKey, ticker, force: false, trigger: "bimonthly_floor" })) });
        } else {
          results.push({ ticker, ok: true, skipped: true, days_since_review: Math.round(daysOld) });
        }
      }
    } catch (err) {
      results.push({ ticker, ok: false, error: err.message });
    }
  }
  return { ok: true, mode, count: results.length, results };
}

// =========================================================================
// MODE 1 — SHORT CURVE (price-blind)
// =========================================================================

async function runShort({ env, apiKey, ticker, force }) {
  const db = env.DB;
  const now = new Date().toISOString();

  // Load inputs
  const [fundRow, factorRow, newsRes, pressRes, baselineLong] = await Promise.all([
    db.prepare(`SELECT * FROM FUND_01_Fundamentals WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
    db.prepare(`SELECT * FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
    db.prepare(`SELECT id, date, title, summary, sentiment, magnitude
                  FROM BETA_12_News_digest
                 WHERE ticker = ? AND type = 'ticker' AND date >= date('now','-7 days')
                 ORDER BY date DESC, rank ASC LIMIT 6`).bind(ticker).all(),
    db.prepare(`SELECT id, date, heading, summary, sentiment, magnitude
                  FROM ALPHA_03_Press WHERE ticker = ? AND date >= date('now','-7 days')
                 ORDER BY date DESC LIMIT 4`).bind(ticker).all(),
    latestLong(db, ticker),
  ]);

  const sector = factorRow?.sector || fundRow?.sector || null;
  const fwdEps = fundRow?.eps || null;
  const baselineFair = baselineLong?.fair_value ?? null;

  // peer_median_pe is NULL for sectors with <3 tickers (Industrial, Staples,
  // Energy can hit this). Fall back to the sector-level fwd_pe_sector from
  // SECTOR_FACTORS_daily (SSGA weighted-harmonic) when needed.
  let peerMedianPe = factorRow?.peer_median_pe || null;
  if (!peerMedianPe && sector) {
    const sec = await db.prepare(
      `SELECT fwd_pe_sector FROM SECTOR_FACTORS_daily
        WHERE sector = ? ORDER BY date DESC LIMIT 1`,
    ).bind(sector).first();
    peerMedianPe = sec?.fwd_pe_sector || null;
  }

  if (fwdEps == null || peerMedianPe == null) {
    return { ok: false, ticker, error: "missing anchors (eps or peer_median_pe)" };
  }

  const naivePeerAnchor = Number(fwdEps) * Number(peerMedianPe);
  const prompt = buildShortPrompt({
    ticker, sector,
    fwdEps, peerMedianPe,
    eps_rev_4w: factorRow?.eps_rev_4w, rev_breadth_4w: factorRow?.rev_breadth_4w,
    naivePeerAnchor,
    baseline: baselineFair,
    baselineDate: baselineLong?.as_of || null,
    news: (newsRes.results || []).map(n => ({
      id: n.id, date: n.date, title: n.title, summary: (n.summary || "").slice(0, 300),
      sentiment: n.sentiment, magnitude: n.magnitude,
    })),
    press: (pressRes.results || []).map(p => ({
      id: p.id, date: p.date, heading: p.heading, summary: (p.summary || "").slice(0, 300),
      sentiment: p.sentiment, magnitude: p.magnitude,
    })),
  });

  const blob = await callGPT5(apiKey, prompt);
  if (blob == null || typeof blob.short_fair_value !== "number") {
    return { ok: false, ticker, error: "invalid LLM output", raw: blob };
  }

  const id = await shortHash(`${ticker}|${now}|short`);
  const adjustmentPct = baselineFair
    ? ((blob.short_fair_value - baselineFair) / baselineFair) * 100
    : null;

  await db.prepare(
    `INSERT INTO SIGNAL_03_ValuationCurve_short
       (id, ticker, as_of, fair_value, baseline_fair_value, adjustment_pct,
        contributing_events_json, trigger_event_id, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ticker, now,
    blob.short_fair_value,
    baselineFair,
    adjustmentPct,
    JSON.stringify(blob.contributing_events || []),
    null,
    "gpt-5",
    now,
  ).run();

  return {
    ok: true,
    ticker,
    as_of: now,
    short_fair_value: blob.short_fair_value,
    baseline_fair_value: baselineFair,
    adjustment_pct: adjustmentPct,
    events_cited: (blob.contributing_events || []).length,
  };
}

function buildShortPrompt({
  ticker, sector, fwdEps, peerMedianPe, eps_rev_4w, rev_breadth_4w,
  naivePeerAnchor, baseline, baselineDate, news, press,
}) {
  const lines = [];
  lines.push(`You are a buy-side analyst producing a SHORT-TERM fair value for ${ticker}.`);
  lines.push(``);
  lines.push(`THE STOCK PRICE IS INTENTIONALLY NOT PROVIDED. Do not estimate or infer it. Derive fair value strictly from fundamental anchors + the recent event stack below.`);
  lines.push(``);
  lines.push(`ANCHORS`);
  lines.push(`- Sector: ${sector || "unknown"}`);
  lines.push(`- Forward EPS: $${num(fwdEps, 2)}`);
  lines.push(`- Sector peer-median P/E: ${num(peerMedianPe, 2)}x`);
  lines.push(`- Naive peer anchor (EPS × peer P/E): $${num(naivePeerAnchor, 2)}`);
  if (eps_rev_4w != null) lines.push(`- Analyst revisions (4w eps_rev): ${num(eps_rev_4w * 100, 2)}%`);
  if (rev_breadth_4w != null) lines.push(`- Revisions breadth (4w): ${num(rev_breadth_4w * 100, 2)}%`);
  lines.push(``);
  lines.push(`BASELINE`);
  if (baseline != null) {
    lines.push(`- Most recent long-term fair value (reviewed ${baselineDate}): $${num(baseline, 2)}`);
    lines.push(`- Your job: adjust this baseline for recent events. The short curve is the long curve ± event-driven drift.`);
  } else {
    lines.push(`- No prior long-term review. Anchor on the naive peer anchor above and adjust for events.`);
  }
  lines.push(``);
  lines.push(`RECENT EVENTS (last 7d, empty sections are genuinely empty — no need to invent)`);
  lines.push(`News digest:`);
  if (!news.length) lines.push(`  (none)`);
  for (const n of news) lines.push(`  - [${n.date}] ${n.sentiment || "neu"} mag=${n.magnitude ?? "?"} — ${n.title}`);
  lines.push(`Press releases:`);
  if (!press.length) lines.push(`  (none)`);
  for (const p of press) lines.push(`  - [${p.date}] ${p.sentiment || "neu"} mag=${p.magnitude ?? "?"} — ${p.heading}`);
  lines.push(``);
  lines.push(`RULES`);
  lines.push(`1. short_fair_value MUST be a number in $. Do not produce a range.`);
  lines.push(`2. If the event stack is empty, short_fair_value MUST equal the baseline (or naive peer anchor when no baseline).`);
  lines.push(`3. Each event in contributing_events must reference an id from the lists above. Do not invent events.`);
  lines.push(`4. delta_pct is the contribution of that event to the short fair value, as %. Sum is informational — not required to match the total shift exactly.`);
  lines.push(``);
  lines.push(`OUTPUT EXACTLY THIS JSON, NOTHING ELSE:`);
  lines.push(`{`);
  lines.push(`  "short_fair_value": 0.00,`);
  lines.push(`  "baseline_fair_value": ${baseline != null ? num(baseline, 2) : naivePeerAnchor.toFixed(2)},`);
  lines.push(`  "rationale_short": "one sentence: what moved this from baseline",`);
  lines.push(`  "contributing_events": [`);
  lines.push(`    {"event_type": "news|press|revision", "event_id": "string", "delta_pct": 0.0, "reason": "short phrase"}`);
  lines.push(`  ]`);
  lines.push(`}`);
  return lines.join("\n");
}

// =========================================================================
// MODE 2 — LONG CURVE (price-aware, anchor-independence constrained)
// =========================================================================

async function runLong({ env, apiKey, ticker, force, trigger }) {
  const db = env.DB;
  const now = new Date().toISOString();

  const [fundRow, factorRow, filingsRes, earningsRes, fomcRes, macroRow, priceRow, prev] = await Promise.all([
    db.prepare(`SELECT * FROM FUND_01_Fundamentals WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
    db.prepare(`SELECT * FROM STOCK_FACTORS_daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
    db.prepare(`SELECT id, date, type, summary FROM ALPHA_01_Reports
                 WHERE ticker = ? AND type IN ('10-K','10-Q','8-K')
                 ORDER BY date DESC LIMIT 6`).bind(ticker).all(),
    db.prepare(`SELECT period, estimate, actual, surprise_pct, report_date
                  FROM FUND_02_Earnings WHERE ticker = ?
                 ORDER BY period DESC LIMIT 6`).bind(ticker).all(),
    db.prepare(`SELECT meeting_date, title, decision_summary FROM MACRO_STATE_fomc
                 ORDER BY meeting_date DESC LIMIT 2`).all(),
    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    db.prepare(`SELECT close FROM PRICE_01_Daily WHERE ticker = ? ORDER BY date DESC LIMIT 1`).bind(ticker).first(),
    latestLong(db, ticker),
  ]);

  const fwdEps = fundRow?.eps || null;
  const sector = factorRow?.sector || fundRow?.sector || null;
  const marketPrice = priceRow?.close ?? null;

  // Same peer_median_pe fallback as runShort (Industrial etc. with <3 tickers).
  let peerMedianPe = factorRow?.peer_median_pe || null;
  if (!peerMedianPe && sector) {
    const sec = await db.prepare(
      `SELECT fwd_pe_sector FROM SECTOR_FACTORS_daily
        WHERE sector = ? ORDER BY date DESC LIMIT 1`,
    ).bind(sector).first();
    peerMedianPe = sec?.fwd_pe_sector || null;
  }

  if (fwdEps == null || peerMedianPe == null) {
    return { ok: false, ticker, error: "missing anchors (eps or peer_median_pe)" };
  }
  if (marketPrice == null) {
    return { ok: false, ticker, error: "missing market price" };
  }

  // Parse macro tilt for sector alignment.
  let macroBlob = null;
  try { macroBlob = macroRow?.summary ? JSON.parse(macroRow.summary) : null; } catch {}
  const sectorTilt = macroBlob?.sector_tilt || null;
  const sectorAlignment = sectorTilt
    ? (sectorTilt.overweight?.includes(sector) ? "overweight"
       : sectorTilt.underweight?.includes(sector) ? "underweight" : "neutral")
    : "unknown";

  const naivePeerAnchor = Number(fwdEps) * Number(peerMedianPe);

  const prompt = buildLongPrompt({
    ticker, sector,
    fwdEps, peerMedianPe, naivePeerAnchor,
    operatingMargin: fundRow?.operating_margin, profitMargin: fundRow?.profit_margin,
    fwdPe: factorRow?.fwd_pe, rel_pe_sigma: factorRow?.rel_pe_sigma,
    eps_rev_4w: factorRow?.eps_rev_4w,
    marketPrice,
    filings: (filingsRes.results || []).map(f => ({
      id: f.id, date: f.date, type: f.type, summary: (f.summary || "").slice(0, 600),
    })),
    earnings: (earningsRes.results || []).map(e => ({
      period: e.period, estimate: e.estimate, actual: e.actual,
      surprise_pct: e.surprise_pct, report_date: e.report_date,
    })),
    fomcs: (fomcRes.results || []).map(f => ({
      meeting_date: f.meeting_date, title: f.title,
      decision_summary: (f.decision_summary || "").slice(0, 300),
    })),
    macroRegime: macroBlob?.trend?.regime || "unknown",
    sectorAlignment,
    prevLong: prev,
  });

  const blob = await callGPT5(apiKey, prompt);
  if (blob == null || typeof blob.long_fair_value !== "number") {
    return { ok: false, ticker, error: "invalid LLM output", raw: blob };
  }

  const id = await shortHash(`${ticker}|${now}|long`);
  const deviation = ((blob.long_fair_value - marketPrice) / marketPrice) * 100;

  await db.prepare(
    `INSERT INTO SIGNAL_03_ValuationCurve_long
       (id, ticker, as_of, fair_value, previous_fair_value,
        market_price_at_review, deviation_pct, rationale,
        key_events_cited_json, would_change_mind_if_json,
        trigger_reason, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ticker, now,
    blob.long_fair_value,
    prev?.fair_value ?? null,
    marketPrice,
    deviation,
    blob.rationale || "",
    JSON.stringify(blob.key_events_cited || []),
    JSON.stringify(blob.would_change_mind_if || []),
    trigger,
    "gpt-5",
    now,
  ).run();

  return {
    ok: true,
    ticker,
    as_of: now,
    long_fair_value: blob.long_fair_value,
    market_price: marketPrice,
    deviation_pct: deviation,
    trigger,
    within_2pct_of_price: Math.abs(deviation) < 2,
  };
}

function buildLongPrompt({
  ticker, sector, fwdEps, peerMedianPe, naivePeerAnchor,
  operatingMargin, profitMargin, fwdPe, rel_pe_sigma, eps_rev_4w,
  marketPrice,
  filings, earnings, fomcs, macroRegime, sectorAlignment,
  prevLong,
}) {
  const lines = [];
  lines.push(`You are a senior equity analyst producing a LONG-TERM fair value for ${ticker}.`);
  lines.push(``);
  lines.push(`This is a structural review — the kind that would appear in a research note. The valuation you produce will set the baseline for all tactical short-term valuations until the next review.`);
  lines.push(``);
  lines.push(`=== FUNDAMENTAL ANCHORS ===`);
  lines.push(`- Sector: ${sector || "unknown"}`);
  lines.push(`- Forward EPS: $${num(fwdEps, 2)}`);
  lines.push(`- Sector peer-median P/E: ${num(peerMedianPe, 2)}x`);
  lines.push(`- Naive peer anchor (EPS × peer P/E): $${num(naivePeerAnchor, 2)}`);
  lines.push(`- Ticker's current fwd P/E vs peers (rel_pe_sigma): ${num(rel_pe_sigma, 2)}σ`);
  if (operatingMargin != null) lines.push(`- Operating margin: ${num(operatingMargin * 100, 1)}%`);
  if (profitMargin != null) lines.push(`- Net margin: ${num(profitMargin * 100, 1)}%`);
  if (eps_rev_4w != null) lines.push(`- 4-week analyst revisions: ${num(eps_rev_4w * 100, 2)}%`);
  lines.push(``);
  lines.push(`=== MACRO / SECTOR CONTEXT ===`);
  lines.push(`- Current regime: ${macroRegime}`);
  lines.push(`- This sector's macro tilt: ${sectorAlignment}`);
  lines.push(`- Recent FOMC decisions:`);
  if (!fomcs.length) lines.push(`    (none in window)`);
  for (const f of fomcs) lines.push(`    [${f.meeting_date}] ${f.decision_summary}`);
  lines.push(``);
  lines.push(`=== STRUCTURAL EVENTS ===`);
  lines.push(`Earnings prints:`);
  if (!earnings.length) lines.push(`  (none)`);
  for (const e of earnings) {
    lines.push(`  - ${e.report_date} · period ${e.period} · est=${e.estimate} actual=${e.actual} surprise=${num(e.surprise_pct, 2)}%`);
  }
  lines.push(`SEC filings:`);
  if (!filings.length) lines.push(`  (none)`);
  for (const f of filings) {
    lines.push(`  - [${f.date}] ${f.type} (id=${f.id})`);
    lines.push(`    ${(f.summary || "").replace(/\s+/g, " ").trim()}`);
  }
  lines.push(``);
  lines.push(`=== PREVIOUS REVIEW ===`);
  if (prevLong) {
    lines.push(`- Last review: ${prevLong.as_of}`);
    lines.push(`- Prior long fair value: $${num(prevLong.fair_value, 2)}`);
    lines.push(`- Prior rationale: ${prevLong.rationale || "(none)"}`);
  } else {
    lines.push(`- No prior review. This is the first long-term valuation for this ticker.`);
  }
  lines.push(``);
  lines.push(`=== MARKET PRICE (for deviation narrative ONLY — DO NOT COPY) ===`);
  lines.push(`- Current market price: $${num(marketPrice, 2)}`);
  lines.push(``);
  lines.push(`=== RULES ===`);
  lines.push(`1. long_fair_value MUST be derived from the fundamental + event inputs above. DO NOT anchor on market price. If your answer rubber-bands to within 2% of market price without explicit justification, you're doing it wrong.`);
  lines.push(`2. If your long_fair_value lands within 2% of market price, the "would_change_mind_if" field MUST name specific triggers that would separate you from market consensus.`);
  lines.push(`3. Ground every piece of rationale in a cited event id or indicator. No vague platitudes.`);
  lines.push(`4. This valuation will be frozen until the next structural event (earnings, 10-K, 10-Q, FOMC) OR 60 days pass. Write with that weight in mind.`);
  lines.push(``);
  lines.push(`OUTPUT EXACTLY THIS JSON, NOTHING ELSE:`);
  lines.push(`{`);
  lines.push(`  "long_fair_value": 0.00,`);
  lines.push(`  "rationale": "2-3 sentences. Grounded in specific filings/earnings/macro. Must explain the chosen multiple and margin assumptions.",`);
  lines.push(`  "key_events_cited": ["id from filings or earnings period string", "..."],`);
  lines.push(`  "deviation_narrative": "one sentence: where you stand vs the market's $${num(marketPrice, 2)}",`);
  lines.push(`  "would_change_mind_if": ["trigger 1", "trigger 2"]`);
  lines.push(`}`);
  return lines.join("\n");
}

// =========================================================================
// MODE R — REALIZE (calibration)
// =========================================================================

async function realize({ env }) {
  const db = env.DB;
  const horizon = 21;

  // Find forecasts whose 21d window has closed and that don't yet have a realized row.
  const rows = await db.prepare(
    `SELECT curve_type, id, ticker, as_of, fair_value
       FROM (
         SELECT 'short' AS curve_type, id, ticker, as_of, fair_value FROM SIGNAL_03_ValuationCurve_short
         UNION ALL
         SELECT 'long'  AS curve_type, id, ticker, as_of, fair_value FROM SIGNAL_03_ValuationCurve_long
       ) c
      WHERE date(c.as_of) <= date('now', '-${horizon} days')
        AND NOT EXISTS (
          SELECT 1 FROM SIGNAL_03_ValuationRealized r
           WHERE r.forecast_curve_id = c.id AND r.horizon_days = ${horizon}
        )
      ORDER BY c.as_of ASC
      LIMIT 200`,
  ).all();

  const now = new Date().toISOString();
  let written = 0;
  for (const r of (rows.results || [])) {
    try {
      const forecastDate = r.as_of.slice(0, 10);
      const realizedDate = addDays(forecastDate, horizon);
      const pF = await db.prepare(`SELECT close FROM PRICE_01_Daily WHERE ticker = ? AND date = ?`).bind(r.ticker, forecastDate).first();
      const pR = await db.prepare(`SELECT close FROM PRICE_01_Daily WHERE ticker = ? AND date = ?`).bind(r.ticker, realizedDate).first();
      if (!pF?.close || !pR?.close) continue;

      const gapAtForecast = ((r.fair_value - pF.close) / pF.close) * 100;
      const gapAtRealized = ((r.fair_value - pR.close) / pR.close) * 100;
      const gapClosed = gapAtForecast - gapAtRealized; // positive = price moved toward fair
      const converged = Math.sign(gapClosed) === Math.sign(gapAtForecast) && gapAtForecast !== 0 ? 1 : 0;

      const id = await shortHash(`${r.ticker}|${forecastDate}|${r.curve_type}|${horizon}`);
      await db.prepare(
        `INSERT INTO SIGNAL_03_ValuationRealized
           (id, ticker, forecast_curve_id, curve_type, forecast_date, realized_date,
            horizon_days, forecast_fair_value, price_at_forecast, price_at_realized,
            gap_at_forecast_pct, gap_closed_pct, converged, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(
        id, r.ticker, r.id, r.curve_type, forecastDate, realizedDate, horizon,
        r.fair_value, pF.close, pR.close, gapAtForecast, gapClosed, converged, now,
      ).run();
      written++;
    } catch (e) {
      console.error(`[val realize] ${r.ticker} ${r.as_of}: ${e.message}`);
    }
  }
  return { ok: true, considered: rows.results?.length || 0, written };
}

// =========================================================================
// STATUS
// =========================================================================

async function status({ env }) {
  const db = env.DB;
  const [shortCount, longCount, realizedCount, latestLongRows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n, MAX(as_of) AS latest FROM SIGNAL_03_ValuationCurve_short`).first(),
    db.prepare(`SELECT COUNT(*) AS n, MAX(as_of) AS latest FROM SIGNAL_03_ValuationCurve_long`).first(),
    db.prepare(`SELECT COUNT(*) AS n, SUM(converged) AS converged FROM SIGNAL_03_ValuationRealized`).first(),
    db.prepare(`SELECT ticker, MAX(as_of) AS last_review, fair_value, deviation_pct
                  FROM SIGNAL_03_ValuationCurve_long GROUP BY ticker`).all(),
  ]);
  return {
    ok: true,
    short: shortCount,
    long: longCount,
    realized: realizedCount,
    long_latest: latestLongRows.results || [],
  };
}

// =========================================================================
// HELPERS
// =========================================================================

async function latestLong(db, ticker) {
  return db.prepare(
    `SELECT id, ticker, as_of, fair_value, rationale
       FROM SIGNAL_03_ValuationCurve_long
      WHERE ticker = ? ORDER BY as_of DESC LIMIT 1`,
  ).bind(ticker).first();
}

function daysSince(iso) {
  const then = new Date(iso).getTime();
  return (Date.now() - then) / 86400000;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function num(v, digits) {
  if (v == null || !Number.isFinite(Number(v))) return "n/a";
  return Number(v).toFixed(digits);
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function callGPT5(apiKey, prompt) {
  const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "gpt-5 error");
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty gpt-5 output");
  return JSON.parse(text);
}
