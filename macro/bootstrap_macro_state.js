// Bootstrap MACRO_STATE_* tables with 8 weeks of history.
// One-shot: fetches from BLS + FRED + Fed RSS, emits INSERT OR IGNORE SQL,
// writes to macro/bootstrap_macro_state.sql for wrangler d1 execute.
//
// Usage:  node macro/bootstrap_macro_state.js
// Then:   npx wrangler d1 execute portfolio-db --remote \
//           --file=macro/bootstrap_macro_state.sql \
//           --config workers/portfolio-ingestor/wrangler.jsonc

import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BLS_KEY = process.env.BLS_KEY;
const FRED_KEY = process.env.FRED_KEY;
const POLYGON_KEY = process.env.POLYGON_KEY;

const WINDOW_DAYS = 56; // 8 weeks
const WINDOW_START = new Date(Date.now() - WINDOW_DAYS * 86400000);
const WINDOW_START_STR = WINDOW_START.toISOString().slice(0, 10);
const TODAY_STR = new Date().toISOString().slice(0, 10);

const sqlEscape = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const hash = (...parts) =>
  crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

const rows = { indicators: [], fomc: [], prices: [] };

// Match portfolio-ingestor shortHash(str, len=6) = first 12 hex chars of SHA-256
async function shortHash12(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

// ---------- BLS ----------
// BLS returns monthly data; we fetch current+prior year and filter by release window.
// BLS does NOT expose the true release date for a period, so we approximate:
// the release of a monthly indicator lands in the following month (~mid-month).
// indicator_code values: CPI_HEADLINE, CPI_CORE, NFP, UNEMP
async function blsSeries(seriesId, code, name, unit) {
  const currentYear = new Date().getFullYear();
  const body = {
    seriesid: [seriesId],
    startyear: String(currentYear - 1),
    endyear: String(currentYear),
    registrationkey: BLS_KEY,
  };
  const { data } = await axios.post(
    "https://api.bls.gov/publicAPI/v2/timeseries/data/",
    body,
  );
  if (!data?.Results?.series?.[0]?.data) {
    console.warn(`[BLS] no data for ${seriesId}`);
    return;
  }
  // Series data is newest-first. Build chronological list so we can pair prior values.
  const series = [...data.Results.series[0].data].reverse();
  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    // row.period = 'M01'..'M12'; row.year = '2026'
    const month = parseInt(row.period.replace("M", ""), 10);
    if (!month || month < 1 || month > 12) continue;
    const period = `${row.year}-${String(month).padStart(2, "0")}`;
    // Approx release date: mid next month for most series; close enough for LLM context.
    const releaseYear = month === 12 ? parseInt(row.year) + 1 : parseInt(row.year);
    const releaseMonth = month === 12 ? 1 : month + 1;
    const releaseDate = `${releaseYear}-${String(releaseMonth).padStart(2, "0")}-15`;
    if (releaseDate < WINDOW_START_STR || releaseDate > TODAY_STR) continue;
    const value = parseFloat(row.value);
    const prior = i > 0 ? parseFloat(series[i - 1].value) : null;
    rows.indicators.push({
      id: hash("BLS", code, period),
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

async function fetchBLS() {
  await blsSeries("CUUR0000SA0", "CPI_HEADLINE", "CPI All Items (NSA)", "index");
  await blsSeries("CUUR0000SA0L1E", "CPI_CORE", "Core CPI (NSA)", "index");
  await blsSeries("CES0000000001", "NFP", "Nonfarm Payrolls (total, k)", "k");
  await blsSeries("LNS14000000", "UNEMP", "Unemployment Rate", "%");
}

// ---------- FRED ----------
// Daily series. Fetch ~70 days to guarantee window coverage, filter to window.
async function fredSeries(seriesId, code, name, unit) {
  let data;
  try {
    const res = await axios.get(
      "https://api.stlouisfed.org/fred/series/observations",
      {
        params: {
          api_key: FRED_KEY,
          series_id: seriesId,
          file_type: "json",
          sort_order: "desc",
          limit: 80,
        },
      },
    );
    data = res.data;
  } catch (err) {
    console.warn(
      `[FRED] fetch failed ${seriesId}: ${err.response?.status || err.message}`,
    );
    return;
  }
  if (!data?.observations) {
    console.warn(`[FRED] no data for ${seriesId}`);
    return;
  }
  // observations newest-first. Walk and pair with prior observation.
  const obs = data.observations;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (o.value === "." || o.value === null) continue;
    if (o.date < WINDOW_START_STR) break;
    if (o.date > TODAY_STR) continue;
    // prior = next newer index in sorted-desc order = next iteration, or null
    let prior = null;
    for (let j = i + 1; j < obs.length; j++) {
      if (obs[j].value !== "." && obs[j].value !== null) {
        prior = parseFloat(obs[j].value);
        break;
      }
    }
    rows.indicators.push({
      id: hash("FRED", code, o.date),
      release_date: o.date,
      period: o.date,
      indicator_code: code,
      indicator_name: name,
      value: parseFloat(o.value),
      prior,
      unit,
      source: "FRED",
    });
  }
}

async function fetchFRED() {
  await fredSeries("DFF", "FEDFUNDS", "Effective Federal Funds Rate", "%");
  await fredSeries("DFEDTARU", "FED_TARGET_UPPER", "Fed Funds Target Range Upper", "%");
  await fredSeries("DFEDTARL", "FED_TARGET_LOWER", "Fed Funds Target Range Lower", "%");
  await fredSeries("DGS2", "DGS2", "2-Year Treasury Yield", "%");
  await fredSeries("DGS10", "DGS10", "10-Year Treasury Yield", "%");
}

// ---------- POLYGON SPY HISTORY ----------
async function fetchSPYHistory() {
  const from = WINDOW_START_STR;
  const to = TODAY_STR;
  const url = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${to}`;
  const { data } = await axios.get(url, {
    params: { adjusted: "true", sort: "asc", limit: 5000, apiKey: POLYGON_KEY },
  });
  if (!data?.results) {
    console.warn("[Polygon] no SPY results", data?.status);
    return;
  }
  for (const bar of data.results) {
    const date = new Date(bar.t).toISOString().slice(0, 10);
    rows.prices.push({
      ticker: "SPY",
      date,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    });
  }
}

// ---------- FOMC ----------
// Fed RSS gives us press release items. Keep the ones that are statements within window,
// then fetch the full body from each item's link.
async function fetchFOMCStatementBody(url) {
  try {
    const { data } = await axios.get(url, { headers: { "User-Agent": "HedgePortfolio/1.0" } });
    const $ = cheerio.load(data);
    const container = $(".col-xs-12.col-sm-8.col-md-8");
    const paragraphs = [];
    container.find("p").each((i, el) => {
      const txt = $(el).text().trim();
      if (txt.length > 0) paragraphs.push(txt);
    });
    return paragraphs.join("\n\n");
  } catch (err) {
    console.warn(`[FOMC] body fetch failed ${url}: ${err.message}`);
    return "";
  }
}

const FOMC_HISTORY_COUNT = 4; // last 4 FOMC statements regardless of window

async function fetchFOMC() {
  const { data } = await axios.get(
    "https://www.federalreserve.gov/feeds/press_monetary.xml",
  );
  const $ = cheerio.load(data, { xmlMode: true });
  const items = [];
  $("item").each((i, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const pubDateRaw = $(el).find("pubDate").text().trim();
    if (!title.toLowerCase().includes("statement")) return;
    const parsed = Date.parse(pubDateRaw);
    if (isNaN(parsed)) return;
    const date = new Date(parsed).toISOString().slice(0, 10);
    items.push({ title, link, date });
  });
  // newest-first from RSS; take the last N meetings
  items.sort((a, b) => b.date.localeCompare(a.date));
  const recent = items.slice(0, FOMC_HISTORY_COUNT);
  for (const item of recent) {
    const body = await fetchFOMCStatementBody(item.link);
    rows.fomc.push({
      id: hash("FOMC", item.date),
      meeting_date: item.date,
      title: item.title,
      decision_summary: null,
      statement_text: body || item.title,
      source_url: item.link,
    });
  }
}

// ---------- Emit SQL ----------
async function emit() {
  const lines = [];
  lines.push("-- Bootstrap MACRO_STATE window: " + WINDOW_START_STR + " .. " + TODAY_STR);
  lines.push("-- Generated " + new Date().toISOString());
  lines.push("");

  for (const r of rows.indicators) {
    lines.push(
      `INSERT OR IGNORE INTO MACRO_STATE_indicators ` +
        `(id, release_date, period, indicator_code, indicator_name, value, prior, unit, source) VALUES (` +
        [
          r.id,
          r.release_date,
          r.period,
          r.indicator_code,
          r.indicator_name,
          r.value,
          r.prior,
          r.unit,
          r.source,
        ]
          .map(sqlEscape)
          .join(", ") +
        ");",
    );
  }
  lines.push("");

  for (const r of rows.fomc) {
    lines.push(
      `INSERT OR IGNORE INTO MACRO_STATE_fomc ` +
        `(id, meeting_date, title, decision_summary, statement_text, source_url) VALUES (` +
        [r.id, r.meeting_date, r.title, r.decision_summary, r.statement_text, r.source_url]
          .map(sqlEscape)
          .join(", ") +
        ");",
    );
  }

  lines.push("");
  for (const p of rows.prices) {
    const id = await shortHash12(`${p.ticker}|${p.date}`);
    lines.push(
      `INSERT OR IGNORE INTO PRICE_01_Daily ` +
        `(id, ticker, date, open, high, low, close, volume) VALUES (` +
        [id, p.ticker, p.date, p.open, p.high, p.low, p.close, p.volume]
          .map(sqlEscape)
          .join(", ") +
        ");",
    );
  }

  const out = path.join(__dirname, "bootstrap_macro_state.sql");
  fs.writeFileSync(out, lines.join("\n") + "\n");
  return out;
}

(async () => {
  console.log(`[bootstrap] window ${WINDOW_START_STR} .. ${TODAY_STR}`);
  await fetchBLS();
  console.log(`[bootstrap] BLS: ${rows.indicators.filter((r) => r.source === "BLS").length} rows`);
  await fetchFRED();
  console.log(
    `[bootstrap] FRED: ${rows.indicators.filter((r) => r.source === "FRED").length} rows`,
  );
  await fetchFOMC();
  console.log(`[bootstrap] FOMC: ${rows.fomc.length} statements`);
  await fetchSPYHistory();
  console.log(`[bootstrap] SPY bars: ${rows.prices.length}`);
  const out = await emit();
  console.log(`[bootstrap] wrote ${out}`);
  console.log(
    `[bootstrap] totals: indicators=${rows.indicators.length} fomc=${rows.fomc.length} prices=${rows.prices.length}`,
  );
})();
