/**
 * MACRO-STATE-FETCHER — daily writer for MACRO_STATE_indicators.
 *
 * Replaces the one-shot macro/bootstrap_macro_state.js with a worker that
 * runs every night and refreshes the rolling 8-week window of FRED + BLS
 * indicator releases. Removes the orphan-read status of the table — the
 * narrator's regime worker and the dashboard's regime detail board now
 * have a recurring source of truth.
 *
 * Indicator codes match what readers expect:
 *   FRED daily : FEDFUNDS, FED_TARGET_UPPER, FED_TARGET_LOWER, DGS2, DGS10
 *   BLS monthly: CPI_HEADLINE, CPI_CORE, NFP, UNEMP
 *
 * Endpoints:
 *   GET /build  — force a pull. Returns {ok, fred, bls, inserted, window}.
 *   GET /status — count + most recent release per indicator_code.
 *
 * Cron: 00:10 UTC daily (10 minutes after economic-calendar-fetcher to spread
 * the load on the D1 database).
 */

const WINDOW_DAYS = 56;

// FRED daily series — fetch ~80 most recent observations per code.
const FRED_SERIES = [
  ["DFF",      "FEDFUNDS",          "Effective Federal Funds Rate",       "%"],
  ["DFEDTARU", "FED_TARGET_UPPER",  "Fed Funds Target Range Upper",       "%"],
  ["DFEDTARL", "FED_TARGET_LOWER",  "Fed Funds Target Range Lower",       "%"],
  ["DGS2",     "DGS2",              "2-Year Treasury Yield",              "%"],
  ["DGS10",    "DGS10",             "10-Year Treasury Yield",             "%"],
];

// BLS monthly series — current+prior year, filter by window.
const BLS_SERIES = [
  ["CUUR0000SA0",    "CPI_HEADLINE", "CPI All Items (NSA)",      "index"],
  ["CUUR0000SA0L1E", "CPI_CORE",     "Core CPI (NSA)",           "index"],
  ["CES0000000001",  "NFP",          "Nonfarm Payrolls (total, k)", "k"],
  ["LNS14000000",    "UNEMP",        "Unemployment Rate",        "%"],
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
    ctx.waitUntil(build(env).catch((e) => console.error(`[macro-state] cron: ${e.message}`)));
  },
};

async function build(env) {
  const fredKey = env.FRED_KEY;
  const blsKey  = env.BLS_KEY;
  if (!fredKey) throw new Error("FRED_KEY secret not set");
  if (!blsKey)  throw new Error("BLS_KEY secret not set");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const windowStart = new Date(today.getTime() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const rows = [];

  // ---------- FRED ----------
  for (const [seriesId, code, name, unit] of FRED_SERIES) {
    const obs = await fetchFRED(fredKey, seriesId);
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.value === "." || o.value === null) continue;
      if (o.date < windowStart) break;
      if (o.date > todayStr) continue;
      let prior = null;
      for (let j = i + 1; j < obs.length; j++) {
        if (obs[j].value !== "." && obs[j].value !== null) {
          prior = parseFloat(obs[j].value);
          break;
        }
      }
      rows.push({
        id: await shortHash(`FRED|${code}|${o.date}`),
        release_date: o.date,
        period:       o.date,
        indicator_code: code,
        indicator_name: name,
        value: parseFloat(o.value),
        prior,
        unit,
        source: "FRED",
      });
    }
  }

  // ---------- BLS ----------
  for (const [seriesId, code, name, unit] of BLS_SERIES) {
    const series = await fetchBLS(blsKey, seriesId);
    for (let i = 0; i < series.length; i++) {
      const row = series[i];
      const month = parseInt(String(row.period || "").replace("M", ""), 10);
      if (!month || month < 1 || month > 12) continue;
      const period = `${row.year}-${String(month).padStart(2, "0")}`;
      // Approx release date: mid of month after the data month.
      const releaseYear  = month === 12 ? parseInt(row.year) + 1 : parseInt(row.year);
      const releaseMonth = month === 12 ? 1 : month + 1;
      const releaseDate  = `${releaseYear}-${String(releaseMonth).padStart(2, "0")}-15`;
      if (releaseDate < windowStart || releaseDate > todayStr) continue;
      const value = parseFloat(row.value);
      const prior = i > 0 ? parseFloat(series[i - 1].value) : null;
      rows.push({
        id: await shortHash(`BLS|${code}|${period}`),
        release_date: releaseDate,
        period,
        indicator_code: code,
        indicator_name: name,
        value,
        prior,
        unit,
        source: "BLS",
      });
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
    fred: rows.filter(r => r.source === "FRED").length,
    bls:  rows.filter(r => r.source === "BLS").length,
    inserted,
  };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            MIN(release_date) AS earliest,
            MAX(release_date) AS latest
       FROM MACRO_STATE_indicators`,
  ).first();

  const latestPerCode = await env.DB.prepare(
    `SELECT i.indicator_code, i.indicator_name, i.value, i.prior, i.unit, i.release_date, i.source
       FROM MACRO_STATE_indicators i
       INNER JOIN (
         SELECT indicator_code, MAX(release_date) AS d
           FROM MACRO_STATE_indicators
          GROUP BY indicator_code
       ) g ON g.indicator_code = i.indicator_code AND g.d = i.release_date
      ORDER BY i.indicator_code`,
  ).all();

  return { ok: true, ...summary, latest_per_code: latestPerCode.results || [] };
}

async function fetchFRED(apiKey, seriesId) {
  const url = `https://api.stlouisfed.org/fred/series/observations?api_key=${apiKey}&series_id=${seriesId}&file_type=json&sort_order=desc&limit=80`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${seriesId} → HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.observations) ? data.observations : [];
}

async function fetchBLS(apiKey, seriesId) {
  const currentYear = new Date().getFullYear();
  const body = {
    seriesid: [seriesId],
    startyear: String(currentYear - 1),
    endyear:   String(currentYear),
    registrationkey: apiKey,
  };
  const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BLS ${seriesId} → HTTP ${res.status}`);
  const data = await res.json();
  const series = data?.Results?.series?.[0]?.data;
  // BLS returns newest-first; reverse to chronological so prior pairing is right.
  return Array.isArray(series) ? [...series].reverse() : [];
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
