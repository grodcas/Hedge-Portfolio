/**
 * MACRO-STATE-FETCHER — daily writer for MACRO_STATE_indicators.
 *
 * Replaces the one-shot macro/bootstrap_macro_state.js with a worker that
 * runs every night and refreshes the rolling 8-week window of FRED + BLS
 * indicator releases. Removes the orphan-read status of the table — the
 * narrator's regime worker and the dashboard's regime detail board now
 * have a recurring source of truth.
 *
 * Indicator codes (read by the dashboard's cross-asset Map + macro slide-out):
 *
 *   Rates / curve         : FEDFUNDS, FED_TARGET_UPPER, FED_TARGET_LOWER,
 *                           DGS2, DGS10, REAL_5Y, BREAKEVEN_5Y, BREAKEVEN_5Y5Y_FWD
 *   Credit                : OAS_IG, OAS_HY
 *   Fed balance sheet     : FED_TOTAL_ASSETS, BANK_RESERVES
 *   FX / commodities      : DXY_BROAD, WTI, GOLD
 *   Vol                   : VIX
 *   Labor (weekly)        : INITIAL_CLAIMS
 *   Survey (monthly)      : UMICH_SENT, INFL_EXP_1Y
 *   BLS prints (monthly)  : CPI_HEADLINE, CPI_CORE, PPI_FINAL_DEMAND, NFP, UNEMP
 *
 * Endpoints:
 *   GET /build  — force a pull. Returns {ok, fred, bls, inserted, window}.
 *   GET /status — count + most recent release per indicator_code.
 *
 * Cron: 00:10 UTC daily (10 minutes after economic-calendar-fetcher to spread
 * the load on the D1 database).
 */

const WINDOW_DAYS = 56;

// FRED daily / weekly / monthly series.
// Tuple: [series_id, indicator_code, indicator_name, unit].
// Codes are descriptive (not raw FRED IDs) so dashboard reads stay legible.
const FRED_SERIES = [
  // -------- Rates / curve --------
  ["DFF",                 "FEDFUNDS",            "Effective Federal Funds Rate",            "%"],
  ["DFEDTARU",            "FED_TARGET_UPPER",    "Fed Funds Target Range Upper",            "%"],
  ["DFEDTARL",            "FED_TARGET_LOWER",    "Fed Funds Target Range Lower",            "%"],
  ["DGS2",                "DGS2",                "2-Year Treasury Yield",                   "%"],
  ["DGS10",               "DGS10",               "10-Year Treasury Yield",                  "%"],
  ["DFII5",               "REAL_5Y",             "5-Year Real (TIPS) Yield",                "%"],
  ["T5YIE",               "BREAKEVEN_5Y",        "5-Year Breakeven Inflation Rate",         "%"],
  ["T5YIFR",              "BREAKEVEN_5Y5Y_FWD",  "5Y5Y Forward Expected Inflation",         "%"],
  // -------- Credit --------
  ["BAMLC0A0CM",          "OAS_IG",              "ICE BofA US IG Corporate OAS",            "%"],
  ["BAMLH0A0HYM2",        "OAS_HY",              "ICE BofA US HY Corporate OAS",            "%"],
  // -------- Fed balance sheet (weekly H.4.1) --------
  ["WALCL",               "FED_TOTAL_ASSETS",    "Federal Reserve Total Assets",            "$M"],
  ["WRESBAL",             "BANK_RESERVES",       "Reserve Balances at the Fed",             "$M"],
  // -------- FX / commodities --------
  ["DTWEXBGS",            "DXY_BROAD",           "Trade-Weighted USD Broad Index",          "index"],
  ["DCOILWTICO",          "WTI",                 "WTI Crude Spot",                          "$/bbl"],
  // Gold moved to yfinance-cross-asset-fetcher (GC=F): FRED retired its
  // GOLDAMGBD228NLBM / GOLDPMGBD228NLBM London-fix series.
  // -------- Vol --------
  ["VIXCLS",              "VIX",                 "CBOE Volatility Index (close)",           "index"],
  // -------- Labor (weekly) --------
  ["ICSA",                "INITIAL_CLAIMS",      "Initial Unemployment Claims",             "claims"],
  // -------- Survey (monthly) --------
  ["UMCSENT",             "UMICH_SENT",          "UMich Consumer Sentiment Index",          "index"],
  ["MICH",                "INFL_EXP_1Y",         "UMich 1-Year Inflation Expectations",     "%"],
];

// BLS monthly series — current+prior year, filter by window.
const BLS_SERIES = [
  ["CUUR0000SA0",    "CPI_HEADLINE",     "CPI All Items (NSA)",         "index"],
  ["CUUR0000SA0L1E", "CPI_CORE",         "Core CPI (NSA)",              "index"],
  ["WPSFD4",         "PPI_FINAL_DEMAND", "PPI Final Demand",            "index"],
  ["CES0000000001",  "NFP",              "Nonfarm Payrolls (total, k)", "k"],
  ["LNS14000000",    "UNEMP",            "Unemployment Rate",           "%"],
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
  // FRED 500s on individual series are common (one bad series shouldn't kill
  // the whole nightly run); catch + log + continue.
  for (const [seriesId, code, name, unit] of FRED_SERIES) {
    let obs;
    try {
      obs = await fetchFRED(fredKey, seriesId);
    } catch (err) {
      console.error(`[macro-state] FRED ${seriesId} (${code}): ${err.message}`);
      continue;
    }
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

  // ---------- CBOE Skew ----------
  // CBOE's CDN (cdn.cboe.com) returns 403 on Cloudflare Workers egress IPs
  // regardless of User-Agent / Referer headers. Verified 2026-05-04 against
  // the public CSV at /api/global/us_indices/daily_skew_values.csv.
  // The local pipeline `macro/scraper.js :: getSkew` works (residential IP)
  // and will be wired through to MACRO_STATE_indicators in a future sprint
  // (likely via a new POST /ingest/skew endpoint or the same path as
  // sentiment-state-fetcher). For now SKEW stays PARSED-BUT-LOST.

  // ---------- BLS ----------
  // Same pattern — log + continue on per-series failures.
  for (const [seriesId, code, name, unit] of BLS_SERIES) {
    let series;
    try {
      series = await fetchBLS(blsKey, seriesId);
    } catch (err) {
      console.error(`[macro-state] BLS ${seriesId} (${code}): ${err.message}`);
      continue;
    }
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

async function fetchCboeSkew() {
  const url = "https://cdn.cboe.com/api/global/us_indices/daily_skew_values.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CBOE SKEW → HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 2) continue;
    const date = cols[0].trim();
    const value = parseFloat(cols[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ date, value });
  }
  // CBOE CSV is chronological (oldest-first); leave as-is so prior pairing is right.
  return out;
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
