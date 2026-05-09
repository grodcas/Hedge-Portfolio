import { logCronRun } from "../../_shared/cron-log.js";
/**
 * SENTIMENT-STATE-FETCHER — daily writer for SENTIMENT_STATE_indicators.
 *
 * The local pipeline writes a JSON blob to BETA_04_Sentiment with three
 * sub-feeds (CBOE Put/Call, AAII bullish/neutral/bearish, COT ES/NQ asset-mgr
 * + leveraged-fund nets). The dashboard's cross-asset Vol·Positioning column
 * reads typed columns, not blobs — this worker mirrors the latest sentiment
 * blob into typed rows in SENTIMENT_STATE_indicators (same shape as
 * MACRO_STATE_indicators).
 *
 * Indicator codes:
 *   PUTCALL_EQUITY     — CBOE equity put/call ratio (type "Put/Call Ratios (CBOE)")
 *   PUTCALL_INDEX      — CBOE index put/call ratio
 *   PUTCALL_TOTAL      — CBOE total put/call ratio
 *   AAII_BULL_BEAR     — AAII bullish % minus bearish %
 *   AAII_BULLISH       — AAII bullish %
 *   AAII_BEARISH       — AAII bearish %
 *   COT_ES_AM_NET      — CFTC E-MINI S&P asset-managers net (longs − shorts)
 *   COT_ES_LF_NET      — CFTC E-MINI S&P leveraged-funds net
 *   COT_NQ_AM_NET      — CFTC NASDAQ asset-managers net
 *   COT_NQ_LF_NET      — CFTC NASDAQ leveraged-funds net
 *
 * Cron: 00:25 UTC daily — after macro-state-fetcher (00:10) and
 * yfinance-cross-asset-fetcher (00:20).
 *
 * Source-of-truth: BETA_04_Sentiment.summary JSON, latest row per type.
 * If a type is missing or the local pipeline didn't run that day, this
 * worker logs and writes whatever sub-feeds it can — partial OK.
 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/build")  return Response.json(await build(env));
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      logCronRun(env, "sentiment-state-fetcher", () => build(env))
        .catch((e) => console.error(`[sentiment-state] cron: ${e.message}`)),
    );
  },
};

async function build(env) {
  // Pull the latest BETA_04_Sentiment row per type (3 types: Put/Call, AAII, COT).
  const types = await env.DB.prepare(
    `SELECT type, summary, date
       FROM BETA_04_Sentiment
       WHERE id IN (
         SELECT id FROM BETA_04_Sentiment b1
         WHERE b1.date = (SELECT MAX(date) FROM BETA_04_Sentiment b2 WHERE b2.type = b1.type)
       )
       ORDER BY type`,
  ).all();

  const rows = [];
  let parsed = 0;
  let skipped = 0;
  const errors = [];

  for (const h of (types.results || [])) {
    let summary;
    try {
      summary = typeof h.summary === "string" ? JSON.parse(h.summary) : h.summary;
    } catch (err) {
      skipped++;
      errors.push({ type: h.type, error: `JSON parse: ${err.message}` });
      continue;
    }
    const date = h.date;

    if (h.type === "Put/Call Ratios (CBOE)") {
      // CBOE keys like 'total_put_call_ratio', 'index_put_call_ratio', 'equity_put_call_ratio'.
      const map = [
        ["equity_put_call_ratio", "PUTCALL_EQUITY", "CBOE Equity Put/Call Ratio"],
        ["index_put_call_ratio",  "PUTCALL_INDEX",  "CBOE Index Put/Call Ratio"],
        ["total_put_call_ratio",  "PUTCALL_TOTAL",  "CBOE Total Put/Call Ratio"],
      ];
      for (const [key, code, name] of map) {
        const v = parseFloat(summary?.[key]);
        if (!Number.isFinite(v)) continue;
        rows.push({ code, name, value: v, prior: null, unit: "ratio", source: "CBOE", date });
      }
      parsed++;
    } else if (h.type === "AAII Sentiment Survey") {
      const latest = summary?.latest;
      const prior  = summary?.previous;
      if (latest) {
        const bull = parseFloat(latest.bullish);
        const bear = parseFloat(latest.bearish);
        if (Number.isFinite(bull)) {
          rows.push({ code: "AAII_BULLISH",   name: "AAII Bullish %", value: bull,
                      prior: parseFloat(prior?.bullish), unit: "%", source: "AAII", date });
        }
        if (Number.isFinite(bear)) {
          rows.push({ code: "AAII_BEARISH",   name: "AAII Bearish %", value: bear,
                      prior: parseFloat(prior?.bearish), unit: "%", source: "AAII", date });
        }
        if (Number.isFinite(bull) && Number.isFinite(bear)) {
          const diff = bull - bear;
          const priorDiff = (Number.isFinite(parseFloat(prior?.bullish)) &&
                             Number.isFinite(parseFloat(prior?.bearish)))
                            ? parseFloat(prior.bullish) - parseFloat(prior.bearish)
                            : null;
          rows.push({ code: "AAII_BULL_BEAR", name: "AAII Bullish minus Bearish",
                      value: diff, prior: priorDiff, unit: "%", source: "AAII", date });
        }
      }
      parsed++;
    } else if (h.type === "COT Futures (ES / NQ)") {
      const es = summary?.es;
      const nq = summary?.nq;
      if (es?.asset_managers_net != null) {
        rows.push({ code: "COT_ES_AM_NET", name: "COT E-MINI S&P Asset Mgr Net",
                    value: Number(es.asset_managers_net), prior: null, unit: "contracts",
                    source: "CFTC", date });
      }
      if (es?.leveraged_funds_net != null) {
        rows.push({ code: "COT_ES_LF_NET", name: "COT E-MINI S&P Leveraged Funds Net",
                    value: Number(es.leveraged_funds_net), prior: null, unit: "contracts",
                    source: "CFTC", date });
      }
      if (nq?.asset_managers_net != null) {
        rows.push({ code: "COT_NQ_AM_NET", name: "COT NASDAQ Asset Mgr Net",
                    value: Number(nq.asset_managers_net), prior: null, unit: "contracts",
                    source: "CFTC", date });
      }
      if (nq?.leveraged_funds_net != null) {
        rows.push({ code: "COT_NQ_LF_NET", name: "COT NASDAQ Leveraged Funds Net",
                    value: Number(nq.leveraged_funds_net), prior: null, unit: "contracts",
                    source: "CFTC", date });
      }
      parsed++;
    } else {
      skipped++;
    }
  }

  // ---------- D1 upsert ----------
  let inserted = 0;
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO SENTIMENT_STATE_indicators
         (id, release_date, period, indicator_code, indicator_name, value, prior, unit, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         release_date   = excluded.release_date,
         period         = excluded.period,
         indicator_name = excluded.indicator_name,
         value          = excluded.value,
         prior          = excluded.prior,
         unit           = excluded.unit,
         source         = excluded.source`,
    )
      .bind(
        await shortHash(`SENTIMENT|${r.code}|${r.date}`),
        r.date,
        r.date,
        r.code,
        r.name,
        r.value,
        Number.isFinite(r.prior) ? r.prior : null,
        r.unit,
        r.source,
      )
      .run();
    inserted++;
  }

  return { ok: true, parsed, skipped, inserted, errors };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            MIN(release_date) AS earliest,
            MAX(release_date) AS latest
       FROM SENTIMENT_STATE_indicators`,
  ).first();

  const latestPerCode = await env.DB.prepare(
    `SELECT i.indicator_code, i.indicator_name, i.value, i.prior, i.unit, i.release_date, i.source
       FROM SENTIMENT_STATE_indicators i
       INNER JOIN (
         SELECT indicator_code, MAX(release_date) AS d
           FROM SENTIMENT_STATE_indicators
          GROUP BY indicator_code
       ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
      ORDER BY i.indicator_code`,
  ).all();

  return { ok: true, ...summary, latest_per_code: latestPerCode.results || [] };
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
