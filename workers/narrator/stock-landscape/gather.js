// Stock-landscape gatherer — pulls the top N=12 shortlist from
// SIGNAL_01_Assessment (ranked by composite score), joins per-stock sector +
// stock_factors, per-stock probability (SIGNAL_02_Probability), and 7d
// news per ticker. Embeds the macro regime label and the top bullets from
// the regime + sector_landscape narratives as context for the prompt.
//
// Schema produced:
//   {
//     as_of, shortlist_date,
//     shortlist: [{ ticker, sector, score, probability: {p_favorable, p_neutral, p_unfavorable},
//                   factors: [{name, value, weight, trust, reason}], stock_factors: {...} }],
//     sector_landscape_top_bullet,
//     regime:   { label, top_bullet },
//     news:     { <ticker>: [{ date, title, summary, sentiment, magnitude }] },
//     calendar: [{ event_date, event_code, event_label }],
//     previous: { current_reading?, identification?, recommendation?, lede?, input_hash? },
//     numeric_snapshot: { shortlist_tickers, scores: {ticker: score}, probabilities: {ticker: {favorable, neutral, unfavorable}} }
//     input_hash
//   }

import { fetchLatest } from "../shared/sql.js";
import { hashInput } from "../shared/hash.js";

const SHORTLIST_N = 12;

export async function gatherStockLandscapeInputs(db) {
  const today = new Date().toISOString().slice(0, 10);

  const maxRow = await db
    .prepare(`SELECT MAX(date) AS d FROM SIGNAL_01_Assessment`)
    .first();
  const shortlistDate = maxRow?.d || today;

  // Top-N by composite score. factors_json is text (parsed below).
  const shortlistRes = await db.prepare(`
    SELECT ticker, score, factors_json, explanation
      FROM SIGNAL_01_Assessment
      WHERE date = ?
      ORDER BY score DESC, ticker ASC
      LIMIT ?
  `).bind(shortlistDate, SHORTLIST_N).all();

  const tickers = (shortlistRes.results || []).map((r) => r.ticker);
  if (!tickers.length) {
    throw new Error(`no SIGNAL_01_Assessment rows for date=${shortlistDate}`);
  }

  // Stock factors + sectors + probabilities for this cohort. One query each.
  const placeholders = tickers.map(() => "?").join(",");

  const [stockFactorsRes, probsRes, newsRes, calRes, macroRow, landscapeIdRow, regimeIdRow,
         prevCR, prevId, prevRec, prevLede] = await Promise.all([
    db.prepare(`
      SELECT ticker, sector, fwd_pe, rel_pe_sigma, eps_rev_4w, rev_breadth_4w,
             sue, mom_12_1, rs_vs_sector_3m, days_to_catalyst,
             piotroski_f, short_pct_float
        FROM STOCK_FACTORS_daily
        WHERE date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
          AND ticker IN (${placeholders})
    `).bind(...tickers).all(),

    db.prepare(`
      SELECT ticker, date, p_favorable, p_neutral, p_unfavorable
        FROM SIGNAL_02_Probability
        WHERE date = (SELECT MAX(date) FROM SIGNAL_02_Probability)
          AND ticker IN (${placeholders})
    `).bind(...tickers).all(),

    // 7d news, capped 4 per ticker so the prompt stays small.
    db.prepare(`
      SELECT date, ticker, title, summary, sentiment, magnitude, rank
        FROM BETA_12_News_digest
        WHERE date >= date('now', '-7 days')
          AND ticker IN (${placeholders})
        ORDER BY date DESC, rank ASC
        LIMIT 80
    `).bind(...tickers).all(),

    // Sprint 11: macro signpost calendar from MACRO_STATE_calendar.
    db.prepare(`
      SELECT event_date, event_time, event_code, event_label, impact,
             consensus, prior, unit
        FROM MACRO_STATE_calendar
        WHERE country = 'US'
          AND event_date >= date('now')
          AND event_date <= date('now', '+45 days')
          AND impact IN ('high','medium')
        ORDER BY event_date, event_time LIMIT 10
    `).all(),

    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    fetchLatest(db, { entity_type: "sector_landscape", entity_id: null, field: "identification" }),
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "identification" }),
    fetchLatest(db, { entity_type: "stock_landscape", entity_id: null, field: "current_reading" }),
    fetchLatest(db, { entity_type: "stock_landscape", entity_id: null, field: "identification" }),
    fetchLatest(db, { entity_type: "stock_landscape", entity_id: null, field: "recommendation" }),
    fetchLatest(db, { entity_type: "stock_landscape", entity_id: null, field: "lede" }),
  ]);

  let macroBlob = null;
  try { macroBlob = macroRow?.summary ? JSON.parse(macroRow.summary) : null; } catch { macroBlob = null; }

  const factorsByTicker = Object.fromEntries(
    (stockFactorsRes.results || []).map((r) => [r.ticker, r])
  );
  const probByTicker = Object.fromEntries(
    (probsRes.results || []).map((r) => [r.ticker, r])
  );

  // Cap 4 news items per ticker.
  const newsByTicker = {};
  for (const n of newsRes.results || []) {
    if (!newsByTicker[n.ticker]) newsByTicker[n.ticker] = [];
    if (newsByTicker[n.ticker].length >= 4) continue;
    newsByTicker[n.ticker].push({
      date: n.date,
      title: n.title,
      summary: _truncate(n.summary, 220),
      sentiment: n.sentiment,
      magnitude: n.magnitude,
    });
  }

  // Top 3 factors per ticker (by |value| × weight, to show what's driving score).
  const shortlist = (shortlistRes.results || []).map((r) => {
    let parsedFactors = [];
    try { parsedFactors = JSON.parse(r.factors_json || "[]"); } catch { parsedFactors = []; }
    const topFactors = [...parsedFactors]
      .sort((a, b) => Math.abs((b.value ?? 0) * (b.weight ?? 1)) - Math.abs((a.value ?? 0) * (a.weight ?? 1)))
      .slice(0, 3)
      .map((f) => ({
        name: f.name, value: f.value, weight: f.weight, trust: f.trust, reason: f.reason,
      }));

    const sf = factorsByTicker[r.ticker] || {};
    const prob = probByTicker[r.ticker] || null;

    return {
      ticker: r.ticker,
      sector: sf.sector || null,
      score: _round(r.score, 3),
      probability: prob
        ? {
            p_favorable:   _round(prob.p_favorable, 3),
            p_neutral:     _round(prob.p_neutral, 3),
            p_unfavorable: _round(prob.p_unfavorable, 3),
            as_of:         prob.date,
          }
        : null,
      top_factors: topFactors,
      stock_factors: {
        fwd_pe:          _round(sf.fwd_pe, 2),
        rel_pe_sigma:    _round(sf.rel_pe_sigma, 2),
        eps_rev_4w:      _round(sf.eps_rev_4w, 4),
        rev_breadth_4w:  _round(sf.rev_breadth_4w, 3),
        sue:             _round(sf.sue, 3),
        mom_12_1:        _round(sf.mom_12_1, 3),
        rs_vs_sector_3m: _round(sf.rs_vs_sector_3m, 3),
        days_to_catalyst: sf.days_to_catalyst,
        piotroski_f:     sf.piotroski_f,
        short_pct_float: _round(sf.short_pct_float, 2),
      },
    };
  });

  // Numeric snapshot for stability gate.
  const shortlist_tickers = shortlist.map((s) => s.ticker);
  const scores = Object.fromEntries(shortlist.map((s) => [s.ticker, s.score]));
  const probabilities = Object.fromEntries(
    shortlist
      .filter((s) => s.probability)
      .map((s) => [
        s.ticker,
        {
          favorable:   s.probability.p_favorable,
          neutral:     s.probability.p_neutral,
          unfavorable: s.probability.p_unfavorable,
        },
      ])
  );
  const numeric_snapshot = { shortlist_tickers, scores, probabilities };

  // Context-only: top identification bullets from the upstream narratives.
  let regimeTopBullet = null;
  try { regimeTopBullet = regimeIdRow?.content?.bullets?.[0] || null; } catch { regimeTopBullet = null; }
  let landscapeTopBullet = null;
  try { landscapeTopBullet = landscapeIdRow?.content?.bullets?.[0] || null; } catch { landscapeTopBullet = null; }

  const input = {
    as_of: today,
    shortlist_date: shortlistDate,
    shortlist,
    sector_landscape_top_bullet: landscapeTopBullet,
    regime: {
      label: macroBlob?.trend?.regime ?? null,
      top_bullet: regimeTopBullet,
    },
    news: newsByTicker,
    // Sprint 11: D1 calendar (Finnhub-sourced) replaces GPT-hallucinated catalysts.
    calendar: (calRes.results || []).map((c) => ({
      event_date: c.event_date,
      event_code: c.event_code,
      event_label: c.event_label,
    })),
    previous: {
      current_reading: prevCR?.content || null,
      identification: prevId?.content || null,
      recommendation: prevRec?.content || null,
      lede: prevLede?.content || null,
      input_hash: prevId?.input_hash || null,
    },
    numeric_snapshot,
  };

  input.input_hash = await hashInput({
    shortlist: shortlist.map((s) => [s.ticker, s.score, s.sector]),
    regime_label: input.regime.label,
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
