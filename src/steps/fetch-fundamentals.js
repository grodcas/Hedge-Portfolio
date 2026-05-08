// src/steps/fetch-fundamentals.js
//
// Local Alpha Vantage fetcher. Runs from the user's machine IP because
// AV rate-limits its free tier per IP, and Cloudflare Workers' shared
// egress pool is already exhausted by other users.
//
// Fetches four AV endpoints per ticker:
//   1. OVERVIEW         — live snapshot (PE, DMA, market cap, etc.). Daily refresh.
//   2. INCOME_STATEMENT — quarterlyReports[0] + [4] (YoY same-quarter compare)
//   3. BALANCE_SHEET    — quarterlyReports[0] + [4]
//   4. CASH_FLOW        — quarterlyReports[0] + [4]
//
// Statement endpoints (2-4) supply Piotroski F-Score feedstock. They are
// EVENT-DRIVEN, not daily: a ticker is only refreshed when SEC has filed a
// new 10-Q whose periodOfReport > our last-stored fiscal_period_ending,
// AND at least AV_INDEX_LAG_DAYS have passed since the filing (to give AV
// time to index it). Each fetch verifies AV's quarterlyReports[0]
// fiscalDateEnding matches the SEC period before claiming success — if
// AV hasn't caught up, we defer to the next nightly run.
//
// Steady-state load: 25 OVERVIEW calls/day + ~4 statement calls × ~25
// 10-Qs/year = ~50 statement calls/year. Comfortably inside any free tier.
//
// One-time backfill: on first run, all 25 tickers will be flagged for
// statement refresh. Free tier 25/day caps progress; converges in 4-5
// nightly runs as the daily budget refreshes.

import { INGEST_BASE } from "../lib/config.js";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

// Same CIK map as edgar/fetch.js. Used to query SEC submissions API for
// the most recent 10-Q filing per ticker.
const TICKER_CIK = {
  AAPL: "0000320193",  MSFT: "0000789019", GOOGL: "0001652044",
  AMZN: "0001018724",  NVDA: "0001045810", META:  "0001326801",
  TSLA: "0001318605",  "BRK.B": "0001067983",
  JPM:  "0000019617",  GS:   "0000886982", BAC:   "0000070858",
  XOM:  "0000034088",  CVX:  "0000093410", UNH:   "0000731766",
  LLY:  "0000059478",  JNJ:  "0000200406", PG:    "0000080424",
  KO:   "0000021344",  HD:   "0000354950", CAT:   "0000018230",
  BA:   "0000012927",  INTC: "0000050863", AMD:   "0000002488",
  NFLX: "0001065280",  MS:   "0000895421",
};

// AV indexing lag: empirically 1-7 days post-SEC-filing. Wait this many days
// after SEC filingDate before the first AV attempt; retry daily until AV's
// quarterlyReports[0] fiscalDateEnding matches SEC's periodOfReport.
const AV_INDEX_LAG_DAYS = 2;
// If a 10-Q is this old and AV still hasn't indexed it, log a warning.
const AV_INDEX_LAG_WARN_DAYS = 14;

// OVERVIEW per-ticker cooldown. PE/DMA/market cap drift slowly enough that a
// 3-day cadence is acceptable and keeps the daily AV burn within budget once
// consensus-fetcher (MS-6d) joins the same 25/day pool.
const OVERVIEW_COOLDOWN_DAYS = 3;

// Single canonical AV budget log line. The Validator tab (MS-7) and the
// pipeline log greppers key on the "AV_BUDGET " prefix.
function logAvCall(endpoint, ticker, ok) {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`AV_BUDGET ${today} ${endpoint} ${ticker} ${ok ? "ok" : "fail"}`);
}

const SEC_USER_AGENT = "HedgePortfolio/1.0 contact@hedge-portfolio.local";

function parseNum(val) {
  if (val == null || val === "None" || val === "-" || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function avSymbol(ticker) {
  return ticker === "BRK.B" ? "BRK-B" : ticker;
}

function checkRateLimit(data, ticker, fn) {
  if (data.Information) throw new Error(`RateLimit ${fn} ${ticker}: ${data.Information.slice(0, 150)}`);
  if (data.Note) throw new Error(`Note ${fn} ${ticker}: ${data.Note.slice(0, 150)}`);
  if (data["Error Message"]) throw new Error(`Error ${fn} ${ticker}: ${data["Error Message"].slice(0, 150)}`);
}

async function fetchOverview(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    logAvCall("OVERVIEW", ticker, false);
    throw new Error(`AV OVERVIEW ${res.status} for ${ticker}`);
  }
  const data = await res.json();
  if (!data.Symbol && !data.PERatio) {
    logAvCall("OVERVIEW", ticker, false);
    checkRateLimit(data, ticker, "OVERVIEW");
    throw new Error(`Empty OVERVIEW for ${ticker}`);
  }
  logAvCall("OVERVIEW", ticker, true);
  return {
    sector: data.Sector || null,
    pe_ratio: parseNum(data.PERatio),
    forward_pe: parseNum(data.ForwardPE),
    eps: parseNum(data.EPS),
    revenue_ttm: parseNum(data.RevenueTTM),
    profit_margin: parseNum(data.ProfitMargin),
    operating_margin: parseNum(data.OperatingMarginTTM),
    market_cap: parseNum(data.MarketCapitalization),
    week_52_high: parseNum(data["52WeekHigh"]),
    week_52_low: parseNum(data["52WeekLow"]),
    dma_50: parseNum(data["50DayMovingAverage"]),
    dma_200: parseNum(data["200DayMovingAverage"]),
    analyst_target: parseNum(data.AnalystTargetPrice),
    dividend_yield: parseNum(data.DividendYield),
    beta: parseNum(data.Beta),
    // Typed multiples promoted from raw_json (migration 0035) so the dashboard
    // can sort / z-score on them without parsing the blob at query time.
    peg_ratio: parseNum(data.PEGRatio),
    ev_ebitda: parseNum(data.EVToEBITDA),
    ev_sales:  parseNum(data.EVToRevenue),
    pb_ratio:  parseNum(data.PriceToBookRatio),
    ps_ratio:  parseNum(data.PriceToSalesRatioTTM),
    roe_ttm:   parseNum(data.ReturnOnEquityTTM),
    roa_ttm:   parseNum(data.ReturnOnAssetsTTM),
    raw_overview: data,
  };
}

// Pull the quarterlyReports array from an AV statement response and return
// (cur=[0], yoy=[4]) — same quarter prior year. Same-quarter YoY kills
// seasonality wobble in working-capital signals (Piotroski 5, 6, 9).
function pickQuarterly(reports, ticker, label) {
  if (!Array.isArray(reports)) {
    throw new Error(`AV ${label} ${ticker}: no quarterlyReports array`);
  }
  if (reports.length < 5) {
    throw new Error(`AV ${label} ${ticker}: only ${reports.length} quarters (need ≥5 for YoY)`);
  }
  return { cur: reports[0], yoy: reports[4] };
}

async function fetchIncomeStatement(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    logAvCall("INCOME_STATEMENT", ticker, false);
    throw new Error(`AV INCOME_STATEMENT ${res.status} for ${ticker}`);
  }
  const data = await res.json();
  checkRateLimit(data, ticker, "INCOME_STATEMENT");
  logAvCall("INCOME_STATEMENT", ticker, true);
  const { cur, yoy } = pickQuarterly(data.quarterlyReports, ticker, "IS");
  return {
    fiscal_period_ending: cur.fiscalDateEnding,
    revenue_annual: parseNum(cur.totalRevenue),         // legacy column name; now quarterly
    revenue_annual_prev: parseNum(yoy.totalRevenue),
    gross_profit: parseNum(cur.grossProfit),
    gross_profit_prev: parseNum(yoy.grossProfit),
    net_income: parseNum(cur.netIncome),
    net_income_prev: parseNum(yoy.netIncome),
    // Full quarterly history — enables 8q / 20q sparklines once persisted
    // into FUND_01_Quarterly. Newest-first; full array (typically 20 quarters).
    _is_quarters: extractQuartersIS(data.quarterlyReports),
  };
}

async function fetchBalanceSheet(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    logAvCall("BALANCE_SHEET", ticker, false);
    throw new Error(`AV BALANCE_SHEET ${res.status} for ${ticker}`);
  }
  const data = await res.json();
  checkRateLimit(data, ticker, "BALANCE_SHEET");
  logAvCall("BALANCE_SHEET", ticker, true);
  const { cur, yoy } = pickQuarterly(data.quarterlyReports, ticker, "BS");
  return {
    fiscal_period_ending: cur.fiscalDateEnding,
    total_assets: parseNum(cur.totalAssets),
    total_assets_prev: parseNum(yoy.totalAssets),
    total_debt: parseNum(cur.longTermDebt),
    total_debt_prev: parseNum(yoy.longTermDebt),
    current_assets: parseNum(cur.totalCurrentAssets),
    current_assets_prev: parseNum(yoy.totalCurrentAssets),
    current_liabilities: parseNum(cur.totalCurrentLiabilities),
    current_liabilities_prev: parseNum(yoy.totalCurrentLiabilities),
    shares_outstanding: parseNum(cur.commonStockSharesOutstanding),
    shares_outstanding_prev: parseNum(yoy.commonStockSharesOutstanding),
    _bs_quarters: extractQuartersBS(data.quarterlyReports),
  };
}

async function fetchCashFlow(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    logAvCall("CASH_FLOW", ticker, false);
    throw new Error(`AV CASH_FLOW ${res.status} for ${ticker}`);
  }
  const data = await res.json();
  checkRateLimit(data, ticker, "CASH_FLOW");
  logAvCall("CASH_FLOW", ticker, true);
  const { cur, yoy } = pickQuarterly(data.quarterlyReports, ticker, "CF");
  return {
    fiscal_period_ending: cur.fiscalDateEnding,
    cfo: parseNum(cur.operatingCashflow),
    cfo_prev: parseNum(yoy.operatingCashflow),
    _cf_quarters: extractQuartersCF(data.quarterlyReports),
  };
}

// Extract the full 20 quarters of statement-by-statement values for downstream
// FUND_01_Quarterly persistence. Each helper returns an array of objects keyed
// by fiscalDateEnding; merge across IS / BS / CF happens in the main loop.
function extractQuartersIS(quarterlyReports) {
  if (!Array.isArray(quarterlyReports)) return [];
  return quarterlyReports.map(q => ({
    fiscal_period_ending: q.fiscalDateEnding,
    total_revenue:    parseNum(q.totalRevenue),
    gross_profit:     parseNum(q.grossProfit),
    operating_income: parseNum(q.operatingIncome),
    net_income:       parseNum(q.netIncome),
    rd_expense:       parseNum(q.researchAndDevelopment),
    sga_expense:      parseNum(q.sellingGeneralAndAdministrative),
    interest_expense: parseNum(q.interestExpense),
    ebit:             parseNum(q.ebit),
    ebitda:           parseNum(q.ebitda),
  })).filter(q => q.fiscal_period_ending);
}

function extractQuartersBS(quarterlyReports) {
  if (!Array.isArray(quarterlyReports)) return [];
  return quarterlyReports.map(q => ({
    fiscal_period_ending:  q.fiscalDateEnding,
    total_assets:          parseNum(q.totalAssets),
    total_liabilities:     parseNum(q.totalLiabilities),
    total_equity:          parseNum(q.totalShareholderEquity),
    current_assets:        parseNum(q.totalCurrentAssets),
    current_liabilities:   parseNum(q.totalCurrentLiabilities),
    inventory:             parseNum(q.inventory),
    receivables:           parseNum(q.currentNetReceivables),
    cash_and_equivalents:  parseNum(q.cashAndCashEquivalentsAtCarrying),
    short_term_debt:       parseNum(q.shortTermDebt),
    long_term_debt:        parseNum(q.longTermDebt),
    shares_outstanding:    parseNum(q.commonStockSharesOutstanding),
  })).filter(q => q.fiscal_period_ending);
}

function extractQuartersCF(quarterlyReports) {
  if (!Array.isArray(quarterlyReports)) return [];
  return quarterlyReports.map(q => ({
    fiscal_period_ending: q.fiscalDateEnding,
    cfo:                  parseNum(q.operatingCashflow),
    capex:                parseNum(q.capitalExpenditures),
    cfi:                  parseNum(q.cashflowFromInvestment),
    cff:                  parseNum(q.cashflowFromFinancing),
    dividends_paid:       parseNum(q.dividendPayout),
    buyback:              parseNum(q.paymentsForRepurchaseOfCommonStock),
  })).filter(q => q.fiscal_period_ending);
}

// Query SEC EDGAR submissions API for the latest 10-Q filing per CIK. Free,
// no key, ~10 req/sec rate limit. Returns {filingDate, periodOfReport} or null.
async function fetchSecLatest10Q(cik) {
  const padded = String(cik).replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const recent = data?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return null;
  const forms = recent.form;
  const filingDates = recent.filingDate || [];
  const reportDates = recent.reportDate || [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "10-Q") {
      return {
        filingDate: filingDates[i],
        periodOfReport: reportDates[i],
      };
    }
  }
  return null;
}

// Decide which tickers need their statement endpoints refreshed today.
// A ticker is selected when SEC has a 10-Q whose periodOfReport > our most
// recent stored fiscal_period_ending, AND at least AV_INDEX_LAG_DAYS have
// elapsed since the SEC filingDate. Returns:
//   { tickers: string[], secByTicker: { [ticker]: {filingDate, periodOfReport} } }
async function selectStatementTickers(today, logger) {
  // 1. Load each ticker's latest fiscal_period_ending from D1.
  const ourPeriodByTicker = {};
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals`);
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data?.results || []);
      for (const r of rows) {
        const t = r.ticker;
        const fp = r.fiscal_period_ending;
        if (!t || !fp) continue;
        if (!ourPeriodByTicker[t] || fp > ourPeriodByTicker[t]) {
          ourPeriodByTicker[t] = fp;
        }
      }
    } else {
      logger.log("FUNDAMENTALS", `query/fundamentals returned HTTP ${res.status}; treating all tickers as needing fetch`, "warn");
    }
  } catch (err) {
    logger.log("FUNDAMENTALS", `query/fundamentals failed (${err.message}); treating all tickers as needing fetch`, "warn");
  }

  // 2. For each ticker, ask SEC about its latest 10-Q and decide.
  const todayMs = new Date(today).getTime();
  const tickers = [];
  const secByTicker = {};

  for (const t of TICKERS) {
    const cik = TICKER_CIK[t];
    if (!cik) {
      logger.log("FUNDAMENTALS", `${t}: no CIK mapping; cannot SEC-check`, "warn");
      continue;
    }
    let info;
    try {
      info = await fetchSecLatest10Q(cik);
    } catch (err) {
      logger.log("FUNDAMENTALS", `${t}: SEC fetch failed (${err.message})`, "warn");
      continue;
    }
    if (!info) {
      logger.log("FUNDAMENTALS", `${t}: no recent 10-Q in SEC submissions`, "warn");
      continue;
    }

    const ours = ourPeriodByTicker[t] || null;
    if (ours && ours >= info.periodOfReport) {
      // We already have this quarter; nothing to do.
      continue;
    }

    const daysSinceFiling = Math.floor((todayMs - new Date(info.filingDate).getTime()) / 86400000);
    if (daysSinceFiling < AV_INDEX_LAG_DAYS) {
      logger.log(
        "FUNDAMENTALS",
        `${t}: 10-Q filed ${info.filingDate} (${daysSinceFiling}d ago); waiting ≥${AV_INDEX_LAG_DAYS}d for AV to index`
      );
      continue;
    }
    if (daysSinceFiling > AV_INDEX_LAG_WARN_DAYS) {
      logger.log(
        "FUNDAMENTALS",
        `${t}: 10-Q filed ${info.filingDate} (${daysSinceFiling}d ago) but AV still hasn't indexed; will retry but please investigate`,
        "warn"
      );
    }

    tickers.push(t);
    secByTicker[t] = info;
  }

  return { tickers, secByTicker };
}

// Runs one endpoint across all remaining tickers, 5 at a time, 62s between batches.
async function runPass(label, endpointFn, apiKey, tickers, results, errors, logger) {
  logger.log("FUNDAMENTALS", `${label}: fetching ${tickers.length} tickers`);
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(t => endpointFn(t, apiKey))
    );
    for (let j = 0; j < batchResults.length; j++) {
      const t = batch[j];
      if (batchResults[j].status === "fulfilled") {
        results[t] = { ...(results[t] || {}), ...batchResults[j].value };
      } else {
        errors.push({ ticker: t, endpoint: label, error: batchResults[j].reason?.message || "unknown" });
      }
    }
    logger.log("FUNDAMENTALS", `${label} batch ${Math.floor(i / 5) + 1}/${Math.ceil(tickers.length / 5)}: cumulative errors=${errors.length}`);
    if (i + 5 < tickers.length) await sleep(62000);
  }
}

// Derive Piotroski feedstock ratios from raw statement data. Factor builder
// computes the 9 binary Piotroski signals from these.
function deriveFeedstock(row) {
  const { total_assets, total_assets_prev, net_income, net_income_prev,
    current_assets, current_assets_prev, current_liabilities, current_liabilities_prev,
    revenue_annual, revenue_annual_prev, gross_profit, gross_profit_prev } = row;

  return {
    roa: total_assets ? net_income / total_assets : null,
    roa_prev: total_assets_prev ? net_income_prev / total_assets_prev : null,
    current_ratio: current_liabilities ? current_assets / current_liabilities : null,
    current_ratio_prev: current_liabilities_prev ? current_assets_prev / current_liabilities_prev : null,
    gross_margin_annual: revenue_annual ? gross_profit / revenue_annual : null,
    gross_margin_annual_prev: revenue_annual_prev ? gross_profit_prev / revenue_annual_prev : null,
    asset_turnover: total_assets ? revenue_annual / total_assets : null,
    asset_turnover_prev: total_assets_prev ? revenue_annual_prev / total_assets_prev : null,
  };
}

export async function fetchFundamentals(config, logger, results, opts = {}) {
  // opts.pass:     "OVERVIEW" | "IS" | "BS" | "CF" | "ALL" (default "ALL")
  // opts.forceAll: bypass the smart-fetch gates (SEC EDGAR check + OVERVIEW
  //                cooldown) and refresh every ticker. Used for one-shot
  //                historical backfills (e.g. patching capex on legacy rows
  //                that the Polygon backfill wrote with capex=NULL). Burns
  //                the daily AV budget — only run manually after a fresh
  //                AV reset (~midnight UTC).
  const pass = (opts.pass || "ALL").toUpperCase();
  const forceAll = !!opts.forceAll;
  const validPasses = ["OVERVIEW", "IS", "BS", "CF", "ALL"];
  if (!validPasses.includes(pass)) {
    throw new Error(`Invalid pass "${pass}". Expected one of ${validPasses.join(", ")}`);
  }

  logger.log("FUNDAMENTALS", `Starting Alpha Vantage fetch (pass=${pass}${forceAll ? ", FORCE-ALL" : ""})...`);

  const apiKey = process.env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    logger.log("FUNDAMENTALS", "ALPHAVANTAGE_KEY not set — skipping", "warn");
    return { data: null, fetched: 0, errors: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);

  // OVERVIEW is the only daily-cadence pass: PE/DMA/market cap change with
  // price. IS/BS/CF are event-driven via SEC 10-Q filings (selectStatementTickers).
  //
  // tickersForOverview: tickers whose OVERVIEW hasn't refreshed today yet.
  // statementTickers:   tickers SEC says have a new 10-Q AV should index by now.
  // secByTicker:        per-ticker {filingDate, periodOfReport} for verification.
  let tickersForOverview = [...TICKERS];
  let statementTickers = [];
  let secByTicker = {};
  let existingRows = [];

  // OVERVIEW cooldown: skip a ticker whose last successful OVERVIEW
  // (pe_ratio non-null) is within the last OVERVIEW_COOLDOWN_DAYS. PE/DMA
  // change with price but the slow-moving fundamentals (margins, market cap)
  // tolerate a 3-day cadence; this halves the daily AV burn so the consensus
  // path can co-exist within the 25/day cap.
  if (forceAll) {
    logger.log("FUNDAMENTALS", `--force-all: bypassing OVERVIEW cooldown for all ${TICKERS.length} tickers`);
  } else {
    try {
      const res = await fetch(`${INGEST_BASE}/query/fundamentals`);
      if (res.ok) {
        const existing = await res.json();
        existingRows = Array.isArray(existing) ? existing : (existing?.results || []);
        const cutoffMs = Date.now() - OVERVIEW_COOLDOWN_DAYS * 86400000;
        const tooFresh = new Set();
        for (const r of existingRows) {
          if (!r.ticker || !r.date || r.pe_ratio == null) continue;
          const ts = Date.parse(r.date);
          if (Number.isFinite(ts) && ts >= cutoffMs) tooFresh.add(r.ticker);
        }
        tickersForOverview = TICKERS.filter(t => !tooFresh.has(t));
        const skipped = TICKERS.length - tickersForOverview.length;
        if (skipped > 0) {
          logger.log("FUNDAMENTALS", `skipping OVERVIEW for ${skipped} tickers (≤${OVERVIEW_COOLDOWN_DAYS}d old)`);
        }
      }
    } catch (err) {
      logger.log("FUNDAMENTALS", `Cooldown check failed, proceeding: ${err.message}`, "warn");
    }
  }

  if (pass === "ALL" || pass === "IS" || pass === "BS" || pass === "CF") {
    if (forceAll) {
      // Bypass the SEC-EDGAR-driven smart-fetch gate. Used for one-shot
      // historical backfills — e.g. patching capex on rows the Polygon
      // backfill wrote with capex=NULL.
      statementTickers = [...TICKERS];
      secByTicker = {};
      logger.log("FUNDAMENTALS", `--force-all: refreshing statements for all ${statementTickers.length} tickers (bypassing EDGAR gate)`);
    } else {
      const sel = await selectStatementTickers(today, logger);
      statementTickers = sel.tickers;
      secByTicker = sel.secByTicker;
      if (statementTickers.length === 0) {
        logger.log("FUNDAMENTALS", "no statement refresh needed today (no new 10-Qs past AV index lag)", "ok");
      } else {
        logger.log(
          "FUNDAMENTALS",
          `${statementTickers.length} tickers need statement refresh: ${statementTickers.join(", ")}`
        );
      }
    }
  }

  // Early exit if there's literally nothing to do.
  const nothingToFetch =
    (pass === "OVERVIEW" && tickersForOverview.length === 0) ||
    ((pass === "IS" || pass === "BS" || pass === "CF") && statementTickers.length === 0) ||
    (pass === "ALL" && tickersForOverview.length === 0 && statementTickers.length === 0);
  if (nothingToFetch) {
    logger.log("FUNDAMENTALS", `pass=${pass}: nothing to fetch — exiting`, "ok");
    return { data: [], fetched: 0, skipped: TICKERS.length };
  }

  // Seed accum with the latest existing row per ticker so partial passes
  // don't clobber previously-fetched fields on upsert.
  const accum = {};
  const allTickersInPlay = new Set([...tickersForOverview, ...statementTickers]);
  // Latest row per ticker (existingRows is today only; need across-days for statement fields)
  let latestByTicker = {};
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals`);
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data?.results || []);
      for (const r of rows) {
        if (!latestByTicker[r.ticker] || (r.date || "") > (latestByTicker[r.ticker].date || "")) {
          latestByTicker[r.ticker] = r;
        }
      }
    }
  } catch { /* fallback to today-only */ }
  for (const t of allTickersInPlay) {
    accum[t] = { ...(latestByTicker[t] || {}) };
  }

  const errors = [];

  // Each pass uses its own ticker list. Statement passes can be empty if no
  // 10-Q has dropped recently.
  const passSpecs = pass === "ALL"
    ? [
        ["OVERVIEW",         fetchOverview,          tickersForOverview],
        ["INCOME_STATEMENT", fetchIncomeStatement,   statementTickers],
        ["BALANCE_SHEET",    fetchBalanceSheet,      statementTickers],
        ["CASH_FLOW",        fetchCashFlow,          statementTickers],
      ]
    : {
        OVERVIEW: [["OVERVIEW",         fetchOverview,        tickersForOverview]],
        IS:       [["INCOME_STATEMENT", fetchIncomeStatement, statementTickers]],
        BS:       [["BALANCE_SHEET",    fetchBalanceSheet,    statementTickers]],
        CF:       [["CASH_FLOW",        fetchCashFlow,        statementTickers]],
      }[pass];

  let executedAny = false;
  for (let i = 0; i < passSpecs.length; i++) {
    const [label, fn, list] = passSpecs[i];
    if (!list || list.length === 0) continue;
    await runPass(label, fn, apiKey, list, accum, errors, logger);
    executedAny = true;
    if (i < passSpecs.length - 1 && passSpecs.slice(i + 1).some(p => p[2]?.length > 0)) {
      await sleep(62000);
    }
  }
  if (!executedAny) {
    logger.log("FUNDAMENTALS", `nothing fetched (all pass lists empty)`, "ok");
  }

  // Verify AV's quarterlyReports[0].fiscalDateEnding actually matches the SEC
  // 10-Q's periodOfReport for each statement-refresh ticker. If AV is still
  // serving the old quarter, drop it from the ingest payload — we'll retry
  // tomorrow when AV catches up. Without this, we'd silently overwrite our
  // existing-but-correct data with stale AV data. Skipped under --force-all
  // (no SEC info collected; the user's explicit override implies trust the
  // AV data we just pulled).
  for (const t of statementTickers) {
    const row = accum[t];
    const sec = secByTicker[t];
    if (forceAll) continue;
    if (!row || !sec) continue;
    const avPeriod = row.fiscal_period_ending;
    if (!avPeriod) {
      // None of IS/BS/CF actually returned successfully for this ticker.
      logger.log("FUNDAMENTALS", `${t}: statement fetch produced no fiscal_period_ending; will retry tomorrow`, "warn");
      // Don't ingest this ticker as-is — preserve the existing-DB row by skipping it.
      delete accum[t];
      continue;
    }
    if (avPeriod < sec.periodOfReport) {
      logger.log(
        "FUNDAMENTALS",
        `${t}: AV indexed period ${avPeriod} < SEC ${sec.periodOfReport} (filed ${sec.filingDate}) — deferring`
      );
      delete accum[t];
      continue;
    }
    // AV caught up: tag with the SEC filing date so subsequent runs skip this ticker.
    row.last_10q_filing_date = sec.filingDate;
  }

  // Build the union of tickers we'll emit: those touched by OVERVIEW today
  // OR by a successful statement refresh.
  const tickersToFetch = [...allTickersInPlay].filter(t => accum[t]);

  // Build merged rows. A ticker is only emitted if OVERVIEW succeeded
  // (OVERVIEW is the only strict requirement; statement fields land as NULL
  // if that endpoint failed — keeps pipeline progressing).
  const fetched = [];
  for (const ticker of tickersToFetch) {
    const row = accum[ticker];
    // For single-pass runs (IS/BS/CF only), a ticker is emitable even
    // without OVERVIEW fields — we're filling Piotroski feedstock.
    const hasOverview = row && (row.pe_ratio != null || row.forward_pe != null || row.market_cap != null);
    const hasStatementData = row && (row.total_assets != null || row.revenue_annual != null || row.cfo != null);
    if (!row || (!hasOverview && !hasStatementData)) continue;
    const derived = deriveFeedstock(row);
    fetched.push({
      ticker,
      date: today,
      // Smart-fetch tracking: which 10-Q's data this row carries.
      fiscal_period_ending: row.fiscal_period_ending ?? null,
      last_10q_filing_date: row.last_10q_filing_date ?? null,
      // OVERVIEW fields
      pe_ratio: row.pe_ratio ?? null,
      forward_pe: row.forward_pe ?? null,
      eps: row.eps ?? null,
      revenue_ttm: row.revenue_ttm ?? null,
      profit_margin: row.profit_margin ?? null,
      operating_margin: row.operating_margin ?? null,
      market_cap: row.market_cap ?? null,
      week_52_high: row.week_52_high ?? null,
      week_52_low: row.week_52_low ?? null,
      dma_50: row.dma_50 ?? null,
      dma_200: row.dma_200 ?? null,
      analyst_target: row.analyst_target ?? null,
      dividend_yield: row.dividend_yield ?? null,
      beta: row.beta ?? null,
      sector: row.sector ?? null,
      // Typed multiples (migration 0035)
      peg_ratio: row.peg_ratio ?? null,
      ev_ebitda: row.ev_ebitda ?? null,
      ev_sales:  row.ev_sales  ?? null,
      pb_ratio:  row.pb_ratio  ?? null,
      ps_ratio:  row.ps_ratio  ?? null,
      roe_ttm:   row.roe_ttm   ?? null,
      roa_ttm:   row.roa_ttm   ?? null,
      // Piotroski feedstock (raw + derived)
      total_assets: row.total_assets ?? null,
      total_assets_prev: row.total_assets_prev ?? null,
      total_debt: row.total_debt ?? null,
      total_debt_prev: row.total_debt_prev ?? null,
      shares_outstanding: row.shares_outstanding ?? null,
      shares_outstanding_prev: row.shares_outstanding_prev ?? null,
      net_income: row.net_income ?? null,
      net_income_prev: row.net_income_prev ?? null,
      revenue_annual: row.revenue_annual ?? null,
      revenue_annual_prev: row.revenue_annual_prev ?? null,
      gross_profit: row.gross_profit ?? null,
      gross_profit_prev: row.gross_profit_prev ?? null,
      cfo: row.cfo ?? null,
      cfo_prev: row.cfo_prev ?? null,
      roa: derived.roa,
      roa_prev: derived.roa_prev,
      current_ratio: derived.current_ratio,
      current_ratio_prev: derived.current_ratio_prev,
      gross_margin_annual: derived.gross_margin_annual,
      gross_margin_annual_prev: derived.gross_margin_annual_prev,
      asset_turnover: derived.asset_turnover,
      asset_turnover_prev: derived.asset_turnover_prev,
      // Preserve raw_json from earlier runs when current pass didn't hit OVERVIEW
      raw_json: row.raw_overview
        ? JSON.stringify(row.raw_overview)
        : (typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json || {})),
    });
  }

  if (fetched.length === 0 && errors.length > 0) {
    const firstErr = errors[0].error;
    logger.log("FUNDAMENTALS", `All calls failed. First: ${firstErr}`, "fail");
    throw new Error(`All Alpha Vantage calls failed. First: ${firstErr}`);
  }

  if (fetched.length > 0) {
    try {
      const res = await fetch(`${INGEST_BASE}/ingest/fundamentals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetched),
      });
      if (res.ok) {
        const data = await res.json();
        logger.log("FUNDAMENTALS", `Ingested ${data.inserted || fetched.length} rows`, "ok");
      } else {
        logger.log("FUNDAMENTALS", `Ingestor returned HTTP ${res.status}`, "warn");
      }
    } catch (err) {
      logger.log("FUNDAMENTALS", `Ingest POST failed: ${err.message}`, "fail");
      throw err;
    }
  }

  // ---------- Per-quarter rows → FUND_01_Quarterly ----------
  // Merge IS / BS / CF quarter arrays into one row per (ticker × fiscal_period_ending).
  // Only emit rows for the tickers whose statement endpoints succeeded this run; on
  // OVERVIEW-only days (or daily runs where IS/BS/CF were skipped per the smart-fetch
  // gate), there are no `_quarters` arrays and nothing to write — no-op is correct.
  //
  // Date alignment: AV reports fiscalDateEnding on calendar quarter-ends (e.g.
  // 2026-03-31), but the original Polygon backfill (scripts/backfill-fundamentals.js)
  // wrote on each ticker's true fiscal-quarter end (AAPL 2026-03-28, NVDA 2026-01-25,
  // etc.). Without snapping, AV creates orphan rows for non-calendar fiscals and FCF
  // (cfo - capex) stays unfillable. Pre-fetch existing dates per ticker, then snap
  // each AV row to the closest match within ±15 days — wide enough to span 4-4-5
  // retail calendars and ±3-day month-end offsets without bleeding into adjacent
  // quarters.
  const tickersWithQuarters = [];
  for (const t of Object.keys(accum)) {
    const r = accum[t];
    if ((r?._is_quarters?.length || 0) > 0 || (r?._bs_quarters?.length || 0) > 0 || (r?._cf_quarters?.length || 0) > 0) {
      tickersWithQuarters.push(t);
    }
  }
  const existingDatesByTicker = {};
  await Promise.all(tickersWithQuarters.map(async t => {
    try {
      const res = await fetch(`${INGEST_BASE}/query/fundamentals-quarterly?ticker=${encodeURIComponent(t)}`);
      if (!res.ok) { existingDatesByTicker[t] = []; return; }
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data?.results || []);
      existingDatesByTicker[t] = rows.map(r => r.fiscal_period_ending).filter(Boolean);
    } catch { existingDatesByTicker[t] = []; }
  }));
  function snapDate(avDate, existingDates) {
    const target = Date.parse(avDate);
    if (!Number.isFinite(target) || !existingDates || existingDates.length === 0) return avDate;
    let best = null, bestDiff = Infinity;
    for (const d of existingDates) {
      const diff = Math.abs(Date.parse(d) - target);
      if (diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return (best && bestDiff <= 15 * 24 * 3600 * 1000) ? best : avDate;
  }

  const quarterlyRows = [];
  let snapsApplied = 0;
  for (const ticker of tickersWithQuarters) {
    const row = accum[ticker];
    const isQ = row?._is_quarters || [];
    const bsQ = row?._bs_quarters || [];
    const cfQ = row?._cf_quarters || [];
    const existingDates = existingDatesByTicker[ticker] || [];

    const byPeriod = new Map();
    const merge = (q) => {
      if (!q.fiscal_period_ending) return;
      const snapped = snapDate(q.fiscal_period_ending, existingDates);
      if (snapped !== q.fiscal_period_ending) snapsApplied++;
      const existing = byPeriod.get(snapped) || {};
      byPeriod.set(snapped, { ...existing, ...q, fiscal_period_ending: snapped });
    };
    isQ.forEach(merge);
    bsQ.forEach(merge);
    cfQ.forEach(merge);

    for (const [period, q] of byPeriod) {
      quarterlyRows.push({ ticker, ...q, fiscal_period_ending: period });
    }
  }
  if (snapsApplied > 0) {
    logger.log("FUNDAMENTALS", `snapped ${snapsApplied} AV calendar dates to existing fiscal_period_ending values (non-calendar fiscals)`);
  }

  if (quarterlyRows.length > 0) {
    try {
      const res = await fetch(`${INGEST_BASE}/ingest/fundamentals-quarterly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quarterlyRows),
      });
      if (res.ok) {
        const data = await res.json();
        logger.log("FUNDAMENTALS", `Ingested ${data.inserted || quarterlyRows.length} quarterly rows`, "ok");
      } else {
        logger.log("FUNDAMENTALS", `Quarterly ingestor returned HTTP ${res.status} — skipping (table may not exist yet; run migration 0036)`, "warn");
      }
    } catch (err) {
      // Non-fatal: the daily fundamentals already shipped, the quarterly history
      // is purely additive and can be retried tomorrow.
      logger.log("FUNDAMENTALS", `Quarterly ingest POST failed: ${err.message}`, "warn");
    }
  }

  if (errors.length > 0) {
    const byEndpoint = errors.reduce((acc, e) => {
      acc[e.endpoint] = (acc[e.endpoint] || 0) + 1;
      return acc;
    }, {});
    logger.log("FUNDAMENTALS", `Partial: ${fetched.length} rows written; errors by endpoint: ${JSON.stringify(byEndpoint)}`, "warn");
  }

  return { data: fetched, fetched: fetched.length, errors: errors.length };
}

export default fetchFundamentals;

// ============================================================
// CLI entrypoint: node src/steps/fetch-fundamentals.js --pass=OVERVIEW
// Invoked directly when run as a script (bypass the pipeline orchestrator).
// ============================================================
const isDirectRun = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch { return false; }
})();

if (isDirectRun) {
  (async () => {
    const passArg = process.argv.find(a => a.startsWith("--pass="));
    const pass = passArg ? passArg.split("=")[1] : "ALL";
    const forceAll = process.argv.includes("--force-all");

    // Load .env from repo root
    try {
      const dotenv = await import("dotenv");
      dotenv.config();
    } catch { /* dotenv optional */ }

    const stubLogger = {
      log: (scope, msg, level = "info") => {
        const tag = level === "fail" ? "❌" : level === "warn" ? "⚠️ " : level === "ok" ? "✅" : "  ";
        console.log(`${tag} [${scope}] ${msg}`);
      },
    };

    const start = Date.now();
    try {
      const out = await fetchFundamentals({}, stubLogger, {}, { pass, forceAll });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\n✅ Done in ${elapsed}s — fetched=${out.fetched ?? 0} errors=${out.errors ?? 0} skipped=${out.skipped ?? 0}`);
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Fatal: ${err.message}`);
      process.exit(1);
    }
  })();
}
