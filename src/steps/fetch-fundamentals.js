// src/steps/fetch-fundamentals.js
//
// Local Alpha Vantage fetcher. Runs from the user's machine IP because
// AV rate-limits its free tier per IP, and Cloudflare Workers' shared
// egress pool is already exhausted by other users.
//
// Fetches four AV endpoints per ticker:
//   1. OVERVIEW         — live snapshot (PE, DMA, market cap, etc.)
//   2. INCOME_STATEMENT — annualReports[0] + [1] for revenue, net income, gross profit
//   3. BALANCE_SHEET    — annualReports[0] + [1] for total assets, debt, current ratio, shares
//   4. CASH_FLOW        — annualReports[0] + [1] for operating cashflow
//
// The three statement endpoints supply Piotroski F-Score feedstock. Each
// endpoint returns 5 years in one call, so we parse [0]=current FY and
// [1]=prior FY to compute YoY deltas downstream in stock-factor-builder.
//
// Rate limiting: four passes of 5-at-a-time batches with 62s between
// batches (AV free-tier burst ceiling is 5/min). 25 tickers × 4 passes
// → 20 batches × 62s ≈ 21 min run time. AV free tier also caps requests
// per day; if that limit is hit, split IS/BS/CF off into a quarterly
// cadence (they only change at earnings).

import { INGEST_BASE } from "../lib/config.js";

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

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
  if (!res.ok) throw new Error(`AV OVERVIEW ${res.status} for ${ticker}`);
  const data = await res.json();
  if (!data.Symbol && !data.PERatio) {
    checkRateLimit(data, ticker, "OVERVIEW");
    throw new Error(`Empty OVERVIEW for ${ticker}`);
  }
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
    raw_overview: data,
  };
}

async function fetchIncomeStatement(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AV INCOME_STATEMENT ${res.status} for ${ticker}`);
  const data = await res.json();
  checkRateLimit(data, ticker, "INCOME_STATEMENT");
  const reports = data.annualReports || [];
  if (reports.length < 2) throw new Error(`AV IS insufficient history for ${ticker}`);
  const cur = reports[0], prev = reports[1];
  return {
    revenue_annual: parseNum(cur.totalRevenue),
    revenue_annual_prev: parseNum(prev.totalRevenue),
    gross_profit: parseNum(cur.grossProfit),
    gross_profit_prev: parseNum(prev.grossProfit),
    net_income: parseNum(cur.netIncome),
    net_income_prev: parseNum(prev.netIncome),
  };
}

async function fetchBalanceSheet(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AV BALANCE_SHEET ${res.status} for ${ticker}`);
  const data = await res.json();
  checkRateLimit(data, ticker, "BALANCE_SHEET");
  const reports = data.annualReports || [];
  if (reports.length < 2) throw new Error(`AV BS insufficient history for ${ticker}`);
  const cur = reports[0], prev = reports[1];
  return {
    total_assets: parseNum(cur.totalAssets),
    total_assets_prev: parseNum(prev.totalAssets),
    total_debt: parseNum(cur.longTermDebt),
    total_debt_prev: parseNum(prev.longTermDebt),
    current_assets: parseNum(cur.totalCurrentAssets),
    current_assets_prev: parseNum(prev.totalCurrentAssets),
    current_liabilities: parseNum(cur.totalCurrentLiabilities),
    current_liabilities_prev: parseNum(prev.totalCurrentLiabilities),
    shares_outstanding: parseNum(cur.commonStockSharesOutstanding),
    shares_outstanding_prev: parseNum(prev.commonStockSharesOutstanding),
  };
}

async function fetchCashFlow(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${avSymbol(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AV CASH_FLOW ${res.status} for ${ticker}`);
  const data = await res.json();
  checkRateLimit(data, ticker, "CASH_FLOW");
  const reports = data.annualReports || [];
  if (reports.length < 2) throw new Error(`AV CF insufficient history for ${ticker}`);
  const cur = reports[0], prev = reports[1];
  return {
    cfo: parseNum(cur.operatingCashflow),
    cfo_prev: parseNum(prev.operatingCashflow),
  };
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
  // opts.pass: "OVERVIEW" | "IS" | "BS" | "CF" | "ALL" (default "ALL")
  const pass = (opts.pass || "ALL").toUpperCase();
  const validPasses = ["OVERVIEW", "IS", "BS", "CF", "ALL"];
  if (!validPasses.includes(pass)) {
    throw new Error(`Invalid pass "${pass}". Expected one of ${validPasses.join(", ")}`);
  }

  logger.log("FUNDAMENTALS", `Starting Alpha Vantage fetch (pass=${pass})...`);

  const apiKey = process.env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    logger.log("FUNDAMENTALS", "ALPHAVANTAGE_KEY not set — skipping", "warn");
    return { data: null, fetched: 0, errors: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Per-pass completeness markers. For a partial run (pass=IS/BS/CF only),
  // we still want to load whatever OVERVIEW row already exists so the ingest
  // payload stays well-formed; but we skip tickers that already have the
  // CURRENT-pass fields populated.
  const passCompletenessField = {
    OVERVIEW: "pe_ratio",
    IS: "revenue_annual",
    BS: "total_assets",
    CF: "cfo",
    ALL: "roa",
  };
  const markerField = passCompletenessField[pass];

  // Idempotency: skip tickers already complete for THIS pass today.
  let tickersToFetch = [...TICKERS];
  let existingRows = [];
  try {
    const res = await fetch(`${INGEST_BASE}/query/fundamentals?date=${today}`);
    if (res.ok) {
      const existing = await res.json();
      existingRows = Array.isArray(existing) ? existing : (existing?.results || []);
      const complete = new Set(existingRows.filter(r => r[markerField] != null).map(r => r.ticker));
      tickersToFetch = TICKERS.filter(t => !complete.has(t));
      if (tickersToFetch.length === 0) {
        logger.log("FUNDAMENTALS", `pass=${pass}: all ${TICKERS.length} already complete today — skipping`, "ok");
        return { data: [], fetched: 0, skipped: TICKERS.length };
      }
      if (tickersToFetch.length < TICKERS.length) {
        logger.log("FUNDAMENTALS", `pass=${pass}: ${tickersToFetch.length}/${TICKERS.length} missing`);
      }
    }
  } catch (err) {
    logger.log("FUNDAMENTALS", `Idempotency check failed, proceeding: ${err.message}`, "warn");
  }

  // Seed accum with existing rows (keeps previously-fetched fields for passes
  // that don't re-fetch them — so the upsert payload doesn't clobber them).
  const accum = {};
  for (const r of existingRows) {
    if (!tickersToFetch.includes(r.ticker)) continue;
    accum[r.ticker] = { ...r };
  }
  const errors = [];

  const passes = pass === "ALL"
    ? [["OVERVIEW", fetchOverview], ["INCOME_STATEMENT", fetchIncomeStatement],
       ["BALANCE_SHEET", fetchBalanceSheet], ["CASH_FLOW", fetchCashFlow]]
    : {
        OVERVIEW: [["OVERVIEW",         fetchOverview]],
        IS:       [["INCOME_STATEMENT", fetchIncomeStatement]],
        BS:       [["BALANCE_SHEET",    fetchBalanceSheet]],
        CF:       [["CASH_FLOW",        fetchCashFlow]],
      }[pass];

  for (let i = 0; i < passes.length; i++) {
    const [label, fn] = passes[i];
    await runPass(label, fn, apiKey, tickersToFetch, accum, errors, logger);
    if (i < passes.length - 1) await sleep(62000);
  }

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
      const out = await fetchFundamentals({}, stubLogger, {}, { pass });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\n✅ Done in ${elapsed}s — fetched=${out.fetched ?? 0} errors=${out.errors ?? 0} skipped=${out.skipped ?? 0}`);
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Fatal: ${err.message}`);
      process.exit(1);
    }
  })();
}
