// Per-stock gatherer — pulls everything the narrator needs for a single
// ticker: factors, probability, fundamentals, earnings, analyst trajectory,
// filings (10-K/10-Q/8-K/Form 4), press, news, long+tactical trend rows,
// sector narrative context, previous stock narrative.
//
// Schema produced (abridged):
//   {
//     as_of, ticker, sector,
//     assessment: { score, factors: [{name, value, weight, trust, reason}], explanation },
//     probability:{ curve_30d: [...], latest: {p_favorable, p_neutral, p_unfavorable} },
//     fundamentals: { pe_ratio, forward_pe, ... market_cap, dma_50, dma_200, analyst_target, beta },
//     stock_factors:{ fwd_pe, rel_pe_sigma, eps_rev_4w, rev_breadth_4w, sue, mom_12_1, rs_vs_sector_3m, days_to_catalyst, piotroski_f, short_pct_float },
//     earnings:  [{ period, report_date, estimate, actual, surprise, surprise_pct }],
//     analyst:   [{ date, strong_buy, buy, hold, sell, strong_sell }],
//     reports:   [{ date, type, summary }],                      // 30d
//     press:     [{ date, heading, summary, sentiment, magnitude }], // 14d
//     news:      [{ date, title, summary, sentiment, magnitude }],   // 7d
//     trend_long:{ regime, score, thesis, drivers, narrative, as_of },
//     trend_short:{ regime, score, trigger, trigger_detail, thesis, drivers, narrative, as_of },
//     sector_top_bullet,           // from per-sector narrative
//     previous: { current_reading?, ident_long?, ident_short?, rec_long?, rec_short?, lede?, input_hash? },
//     numeric_snapshot: { score, factor_signs: {...}, latest_report_dates: {...} },
//     input_hash
//   }

import { fetchLatest } from "../shared/sql.js";
import { hashInput } from "../shared/hash.js";

// Known universe — matches SECTOR_BUCKET in the factor builders.
const KNOWN_TICKERS = new Set([
  "AAPL","MSFT","NVDA","INTC","AMD",
  "AMZN","TSLA","HD",
  "GOOGL","META","NFLX",
  "JPM","GS","BAC","MS","BRK.B",
  "XOM","CVX",
  "UNH","LLY","JNJ",
  "PG","KO",
  "CAT","BA",
]);

export function isKnownTicker(t) {
  return KNOWN_TICKERS.has(t);
}

export function listKnownTickers() {
  return [...KNOWN_TICKERS];
}

export async function gatherStockInputs(db, ticker) {
  if (!isKnownTicker(ticker)) {
    throw new Error(`unknown ticker: ${ticker} (must be one of ${[...KNOWN_TICKERS].join(", ")})`);
  }

  const today = new Date().toISOString().slice(0, 10);

  const [
    assessmentRow, probCurveRes, fundRow, stockFactorsRow,
    earningsRes, analystRes, reportsRes, pressRes, newsRes,
    trendLongRow, trendShortRow,
    prevCR, prevIL, prevIS, prevRL, prevRS, prevLede,
  ] = await Promise.all([
    db.prepare(`
      SELECT ticker, score, factors_json, explanation, date
        FROM SIGNAL_01_Assessment
        WHERE ticker = ? AND date = (SELECT MAX(date) FROM SIGNAL_01_Assessment WHERE ticker = ?)
    `).bind(ticker, ticker).first(),

    db.prepare(`
      SELECT date, p_favorable, p_neutral, p_unfavorable
        FROM SIGNAL_02_Probability
        WHERE ticker = ? AND date >= date('now', '-30 days')
        ORDER BY date ASC
    `).bind(ticker).all(),

    db.prepare(`
      SELECT ticker, date, pe_ratio, forward_pe, eps, revenue_ttm,
             profit_margin, operating_margin, market_cap,
             week_52_high, week_52_low, dma_50, dma_200,
             analyst_target, dividend_yield, beta, sector
        FROM FUND_01_Fundamentals
        WHERE ticker = ?
        ORDER BY date DESC LIMIT 1
    `).bind(ticker).first(),

    db.prepare(`
      SELECT ticker, sector, fwd_pe, rel_pe_sigma, eps_rev_4w, rev_breadth_4w,
             sue, mom_12_1, rs_vs_sector_3m, days_to_catalyst,
             piotroski_f, short_pct_float, peer_median_pe
        FROM STOCK_FACTORS_daily
        WHERE ticker = ? AND date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
    `).bind(ticker).first(),

    db.prepare(`
      SELECT ticker, period, estimate, actual, surprise, surprise_pct, report_date
        FROM FUND_02_Earnings
        WHERE ticker = ?
        ORDER BY report_date DESC LIMIT 4
    `).bind(ticker).all(),

    db.prepare(`
      SELECT date, strong_buy, buy, hold, sell, strong_sell
        FROM FUND_03_Recommendations
        WHERE ticker = ? AND date >= date('now', '-90 days')
        ORDER BY date ASC
    `).bind(ticker).all(),

    db.prepare(`
      SELECT date, type, summary
        FROM ALPHA_01_Reports
        WHERE ticker = ? AND date >= date('now', '-30 days')
        ORDER BY date DESC LIMIT 8
    `).bind(ticker).all(),

    db.prepare(`
      SELECT date, heading, summary, sentiment, magnitude
        FROM ALPHA_03_Press
        WHERE ticker = ? AND date >= date('now', '-14 days')
        ORDER BY date DESC LIMIT 6
    `).bind(ticker).all(),

    db.prepare(`
      SELECT date, title, summary, sentiment, magnitude
        FROM BETA_12_News_digest
        WHERE ticker = ? AND date >= date('now', '-7 days')
        ORDER BY date DESC, rank ASC LIMIT 8
    `).bind(ticker).all(),

    db.prepare(`
      SELECT ticker, as_of, regime, score, thesis, drivers, narrative
        FROM TICKER_TREND_long
        WHERE ticker = ?
        ORDER BY as_of DESC LIMIT 1
    `).bind(ticker).first(),

    db.prepare(`
      SELECT ticker, as_of, trigger, trigger_detail, regime, score,
             thesis, drivers, narrative
        FROM TICKER_TREND_short
        WHERE ticker = ?
        ORDER BY as_of DESC LIMIT 1
    `).bind(ticker).first(),

    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "current_reading" }),
    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "ident_long" }),
    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "ident_short" }),
    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "rec_long" }),
    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "rec_short" }),
    fetchLatest(db, { entity_type: "stock", entity_id: ticker, field: "lede" }),
  ]);

  if (!assessmentRow) {
    throw new Error(`no SIGNAL_01_Assessment for ticker=${ticker}`);
  }

  const sector = stockFactorsRow?.sector || fundRow?.sector || null;

  // Parse factors_json
  let factors = [];
  try { factors = JSON.parse(assessmentRow.factors_json || "[]"); } catch { factors = []; }

  // Sector top identification bullet — context only.
  let sectorTopBullet = null;
  if (sector) {
    const sectorId = await fetchLatest(db, { entity_type: "sector", entity_id: sector, field: "identification" });
    try { sectorTopBullet = sectorId?.content?.bullets?.[0] || null; } catch { sectorTopBullet = null; }
  }

  const probCurve = (probCurveRes.results || []).map((r) => ({
    date: r.date,
    p_favorable:   _round(r.p_favorable, 3),
    p_neutral:     _round(r.p_neutral, 3),
    p_unfavorable: _round(r.p_unfavorable, 3),
  }));
  const latestProb = probCurve[probCurve.length - 1] || null;

  const earnings = (earningsRes.results || []).map((r) => ({
    period:       r.period,
    report_date:  r.report_date,
    estimate:     _round(r.estimate, 3),
    actual:       _round(r.actual, 3),
    surprise:     _round(r.surprise, 3),
    surprise_pct: _round(r.surprise_pct, 2),
  }));

  const analyst = (analystRes.results || []).map((r) => ({
    date: r.date,
    strong_buy: r.strong_buy, buy: r.buy, hold: r.hold,
    sell: r.sell, strong_sell: r.strong_sell,
  }));

  const reports = (reportsRes.results || []).map((r) => ({
    date: r.date,
    type: r.type,
    summary: _truncate(r.summary, 400),
  }));

  const press = (pressRes.results || []).map((r) => ({
    date: r.date,
    heading: r.heading,
    summary: _truncate(r.summary, 300),
    sentiment: r.sentiment,
    magnitude: r.magnitude,
  }));

  const news = (newsRes.results || []).map((r) => ({
    date: r.date,
    title: r.title,
    summary: _truncate(r.summary, 240),
    sentiment: r.sentiment,
    magnitude: r.magnitude,
  }));

  const fundamentals = fundRow ? {
    date: fundRow.date,
    pe_ratio:        _round(fundRow.pe_ratio, 2),
    forward_pe:      _round(fundRow.forward_pe, 2),
    eps:             _round(fundRow.eps, 2),
    revenue_ttm:     fundRow.revenue_ttm,
    profit_margin:   _round(fundRow.profit_margin, 3),
    operating_margin:_round(fundRow.operating_margin, 3),
    market_cap:      fundRow.market_cap,
    week_52_high:    _round(fundRow.week_52_high, 2),
    week_52_low:     _round(fundRow.week_52_low, 2),
    dma_50:          _round(fundRow.dma_50, 2),
    dma_200:         _round(fundRow.dma_200, 2),
    analyst_target:  _round(fundRow.analyst_target, 2),
    dividend_yield:  _round(fundRow.dividend_yield, 3),
    beta:            _round(fundRow.beta, 2),
  } : null;

  const stockFactors = stockFactorsRow ? {
    fwd_pe:           _round(stockFactorsRow.fwd_pe, 2),
    rel_pe_sigma:     _round(stockFactorsRow.rel_pe_sigma, 2),
    peer_median_pe:   _round(stockFactorsRow.peer_median_pe, 2),
    eps_rev_4w:       _round(stockFactorsRow.eps_rev_4w, 4),
    rev_breadth_4w:   _round(stockFactorsRow.rev_breadth_4w, 3),
    sue:              _round(stockFactorsRow.sue, 3),
    mom_12_1:         _round(stockFactorsRow.mom_12_1, 3),
    rs_vs_sector_3m:  _round(stockFactorsRow.rs_vs_sector_3m, 3),
    days_to_catalyst: stockFactorsRow.days_to_catalyst,
    piotroski_f:      stockFactorsRow.piotroski_f,
    short_pct_float:  _round(stockFactorsRow.short_pct_float, 2),
  } : null;

  const trendLong = trendLongRow ? {
    as_of: trendLongRow.as_of,
    regime: trendLongRow.regime,
    score:  _round(trendLongRow.score, 2),
    thesis: trendLongRow.thesis,
    drivers: _safeParse(trendLongRow.drivers),
    narrative: trendLongRow.narrative,
  } : null;

  const trendShort = trendShortRow ? {
    as_of: trendShortRow.as_of,
    regime: trendShortRow.regime,
    score:  _round(trendShortRow.score, 2),
    trigger: trendShortRow.trigger,
    trigger_detail: trendShortRow.trigger_detail,
    thesis: trendShortRow.thesis,
    drivers: _safeParse(trendShortRow.drivers),
    narrative: trendShortRow.narrative,
  } : null;

  // Numeric snapshot for stability gate.
  // - score drift threshold (plan: <0.25 move)
  // - factor sign flips (any factor changing sign breaks stability)
  // - latest dates for earnings / 8-K / Form 4 (new filing in window breaks)
  const factor_signs = {};
  for (const f of factors) {
    factor_signs[f.name] = _sign(f.value);
  }
  const latest_earnings_date = earnings[0]?.report_date || null;
  const latest_8k_date = (reports.find((r) => (r.type || "").toUpperCase().startsWith("8-K")) || {}).date || null;
  const latest_form4_date = (reports.find((r) => (r.type || "").toUpperCase().startsWith("4") || (r.type || "").toUpperCase().includes("FORM 4")) || {}).date || null;
  const numeric_snapshot = {
    score: _round(assessmentRow.score, 3),
    factor_signs,
    latest_earnings_date,
    latest_8k_date,
    latest_form4_date,
    p_favorable: latestProb?.p_favorable ?? null,
  };

  const input = {
    as_of: today,
    ticker,
    sector,
    assessment: {
      score: _round(assessmentRow.score, 3),
      factors: factors.map((f) => ({
        name: f.name,
        value: f.value,
        weight: f.weight,
        trust: f.trust,
        reason: f.reason,
      })),
      explanation: assessmentRow.explanation,
      date: assessmentRow.date,
    },
    probability: {
      latest: latestProb,
      curve_30d: probCurve,
    },
    fundamentals,
    stock_factors: stockFactors,
    earnings,
    analyst,
    reports,
    press,
    news,
    trend_long: trendLong,
    trend_short: trendShort,
    sector_top_bullet: sectorTopBullet,
    previous: {
      current_reading: prevCR?.content || null,
      ident_long:      prevIL?.content || null,
      ident_short:     prevIS?.content || null,
      rec_long:        prevRL?.content || null,
      rec_short:       prevRS?.content || null,
      lede:            prevLede?.content || null,
      input_hash:      prevIL?.input_hash || null,
    },
    numeric_snapshot,
  };

  input.input_hash = await hashInput({
    ticker,
    score: numeric_snapshot.score,
    factor_signs,
    latest_earnings_date,
    latest_8k_date,
    latest_form4_date,
  });

  return input;
}

function _truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function _round(n, p) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = Math.pow(10, p);
  return Math.round(Number(n) * f) / f;
}

function _sign(v) {
  if (v == null || !Number.isFinite(Number(v))) return 0;
  if (Number(v) > 0) return 1;
  if (Number(v) < 0) return -1;
  return 0;
}

function _safeParse(s) {
  if (!s) return null;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}
