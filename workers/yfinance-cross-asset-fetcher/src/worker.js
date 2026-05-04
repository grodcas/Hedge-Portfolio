/**
 * YFINANCE-CROSS-ASSET-FETCHER — daily writer for free-tier FX / commodity / vol series.
 *
 * Yahoo Finance's `query1.finance.yahoo.com/v8/finance/chart` endpoint is the
 * cleanest free path for the three cross-asset symbols that Polygon's free tier
 * doesn't cover (EURUSD, Copper futures, VVIX). Writes into MACRO_STATE_indicators
 * the same way macro-state-fetcher does so the dashboard treats all cross-asset
 * tiles uniformly.
 *
 * Symbols + indicator codes:
 *   EURUSD=X → EURUSD   (FX, daily)
 *   HG=F     → COPPER   (front-month copper futures, daily)
 *   ^VVIX    → VVIX     (vol-of-vol, daily)
 *
 * Endpoints:
 *   GET /build  — force a pull. Returns {ok, fetched, inserted, window}.
 *   GET /status — count + most recent release per indicator_code.
 *
 * Cron: 00:20 UTC daily — after macro-state-fetcher (00:10) and
 * economic-calendar-fetcher (00:00) to avoid bursty D1 writes.
 */

const WINDOW_DAYS = 56;

// Tuple: [yahoo_symbol, indicator_code, indicator_name, unit].
const SYMBOLS = [
  ["EURUSD=X", "EURUSD", "EUR/USD spot",                     "rate"],
  ["HG=F",     "COPPER", "Copper Front-Month Futures",       "$/lb"],
  ["GC=F",     "GOLD",   "Gold Front-Month Futures",         "$/oz"],
  ["^VVIX",    "VVIX",   "CBOE VVIX (vol of vol)",           "index"],
];

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
    ctx.waitUntil(build(env).catch((e) => console.error(`[yfinance-cross-asset] cron: ${e.message}`)));
  },
};

async function build(env) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const windowStart = new Date(today.getTime() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const rows = [];
  let fetched = 0;

  for (const [symbol, code, name, unit] of SYMBOLS) {
    let obs;
    try {
      obs = await fetchYahooChart(symbol);
    } catch (err) {
      console.error(`[yfinance-cross-asset] ${code}: ${err.message}`);
      continue;
    }
    fetched++;
    // obs is chronological (oldest-first); pair prior with the previous valid obs.
    let prior = null;
    for (const o of obs) {
      if (!Number.isFinite(o.value)) continue;
      if (o.date < windowStart || o.date > todayStr) {
        prior = o.value;
        continue;
      }
      rows.push({
        id: await shortHash(`YAHOO|${code}|${o.date}`),
        release_date: o.date,
        period:       o.date,
        indicator_code: code,
        indicator_name: name,
        value: o.value,
        prior,
        unit,
        source: "YAHOO",
      });
      prior = o.value;
    }
  }

  // ---------- D1 upsert ----------
  let inserted = 0;
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO MACRO_STATE_indicators
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
      .bind(r.id, r.release_date, r.period, r.indicator_code, r.indicator_name,
            r.value, r.prior, r.unit, r.source)
      .run();
    inserted++;
  }

  return {
    ok: true,
    window: { from: windowStart, to: todayStr },
    fetched,
    inserted,
  };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count
       FROM MACRO_STATE_indicators
      WHERE source = 'YAHOO'`,
  ).first();

  const latestPerCode = await env.DB.prepare(
    `SELECT i.indicator_code, i.indicator_name, i.value, i.prior, i.unit, i.release_date
       FROM MACRO_STATE_indicators i
       INNER JOIN (
         SELECT indicator_code, MAX(release_date) AS d
           FROM MACRO_STATE_indicators
          WHERE source = 'YAHOO'
          GROUP BY indicator_code
       ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
      ORDER BY i.indicator_code`,
  ).all();

  return { ok: true, ...summary, latest_per_code: latestPerCode.results || [] };
}

async function fetchYahooChart(symbol) {
  // Yahoo's free chart endpoint. Forces a User-Agent because some edge nodes
  // 401 unrecognised UAs.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HF-pipeline/1.0)" },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} → HTTP ${res.status}`);
  const data = await res.json();
  const chart = data?.chart?.result?.[0];
  const timestamps = chart?.timestamp || [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    out.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      value: c,
    });
  }
  return out;
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
