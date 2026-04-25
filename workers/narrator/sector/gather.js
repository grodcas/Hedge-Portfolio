// Per-sector gatherer — pulls everything the narrator needs to produce a
// single-sector identification + recommendation + lede.
//
// Takes one canonical sector name (Communication, ConsDisc, Energy, Finance,
// Healthcare, Industrial, Staples, Technology). Returns:
//
//   {
//     as_of, sector_date, sector,
//     factors:    { regime_fit, earn_momentum, valuation_sigma, rel_strength_13w,
//                   rs_ratio, rs_momentum, breadth_above_200dma, fwd_pe_sector,
//                   stance, stance_score, beat_rate_sector },
//     peers:      [{ sector, stance, stance_score, regime_fit }, ...],   // all 8, ordered
//     constituents: [{ ticker, score, stock_factors: {...}, top_factors }],
//     news:       [{ date, ticker, title, summary, sentiment, magnitude }],
//     earnings:   [{ ticker, report_date, period, estimate }],
//     regime:     { label, top_bullet },                                   // macro context
//     landscape:  { top_bullet, stance_text },                              // sector_landscape context
//     previous:   { current_reading?, identification?, recommendation?, lede?, input_hash? },
//     numeric_snapshot: { stance_score, regime_fit, valuation_sigma, rel_strength_13w, top_3_tickers },
//     input_hash
//   }

import { fetchLatest } from "../shared/sql.js";
import { hashInput } from "../shared/hash.js";

const CANONICAL_SECTORS = new Set([
  "Communication", "ConsDisc", "Energy", "Finance",
  "Healthcare", "Industrial", "Staples", "Technology",
]);

export function isCanonicalSector(s) {
  return CANONICAL_SECTORS.has(s);
}

export function listCanonicalSectors() {
  return [...CANONICAL_SECTORS];
}

export async function gatherSectorInputs(db, sector) {
  if (!isCanonicalSector(sector)) {
    throw new Error(`unknown sector: ${sector} (must be one of ${[...CANONICAL_SECTORS].join(", ")})`);
  }

  const today = new Date().toISOString().slice(0, 10);

  const maxRow = await db
    .prepare(`SELECT MAX(date) AS d FROM SECTOR_FACTORS_daily`)
    .first();
  const sectorDate = maxRow?.d || today;

  const [factorRow, peersRes, tickersRes, newsRes, earningsRes, calRes, macroRow, landscapeIdRow, regimeIdRow,
         prevCR, prevId, prevRec, prevLede] = await Promise.all([
    // Target sector's own factors
    db.prepare(`
      SELECT sector, date, regime_fit, earn_momentum, beat_rate_sector,
             valuation_sigma, rel_strength_13w, rs_ratio, rs_momentum,
             stance, stance_score, fwd_pe_sector, breadth_above_200dma
        FROM SECTOR_FACTORS_daily
        WHERE sector = ? AND date = ?
    `).bind(sector, sectorDate).first(),

    // All 8 sectors (peer snapshot, ordered by stance_score)
    db.prepare(`
      SELECT sector, stance, stance_score, regime_fit, rel_strength_13w,
             valuation_sigma, fwd_pe_sector
        FROM SECTOR_FACTORS_daily
        WHERE date = ?
        ORDER BY stance_score DESC
    `).bind(sectorDate).all(),

    // Constituents of this sector — top-scoring tickers first.
    db.prepare(`
      SELECT sf.ticker, sf.sector, sf.date,
             sf.rs_vs_sector_3m, sf.mom_12_1, sf.fwd_pe, sf.rel_pe_sigma,
             sf.peer_median_pe, sf.eps_rev_4w, sf.rev_breadth_4w,
             sf.sue, sf.piotroski_f, sf.days_to_catalyst, sf.short_pct_float,
             sa.score
        FROM STOCK_FACTORS_daily sf
        LEFT JOIN SIGNAL_01_Assessment sa
          ON sa.ticker = sf.ticker
         AND sa.date = (SELECT MAX(date) FROM SIGNAL_01_Assessment)
        WHERE sf.sector = ?
          AND sf.date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
        ORDER BY COALESCE(sa.score, 0) DESC
    `).bind(sector).all(),

    // Sector-tagged 7d news via ticker→sector join.
    db.prepare(`
      SELECT n.date, n.ticker, n.title, n.summary, n.category, n.rank,
             n.sentiment, n.magnitude
        FROM BETA_12_News_digest n
        JOIN STOCK_FACTORS_daily sf
          ON sf.ticker = n.ticker
         AND sf.date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
        WHERE sf.sector = ?
          AND n.date >= date('now', '-7 days')
          AND n.ticker IS NOT NULL
        ORDER BY n.date DESC, n.rank ASC
        LIMIT 20
    `).bind(sector).all(),

    // Upcoming earnings (next 60d) for constituents.
    db.prepare(`
      SELECT e.ticker, e.period, e.report_date, e.estimate
        FROM FUND_02_Earnings e
        JOIN STOCK_FACTORS_daily sf
          ON sf.ticker = e.ticker
         AND sf.date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
        WHERE sf.sector = ?
          AND e.report_date >= date('now')
          AND e.report_date <= date('now', '+60 days')
        ORDER BY e.report_date ASC
        LIMIT 20
    `).bind(sector).all(),

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
    fetchLatest(db, { entity_type: "sector", entity_id: sector, field: "current_reading" }),
    fetchLatest(db, { entity_type: "sector", entity_id: sector, field: "identification" }),
    fetchLatest(db, { entity_type: "sector", entity_id: sector, field: "recommendation" }),
    fetchLatest(db, { entity_type: "sector", entity_id: sector, field: "lede" }),
  ]);

  if (!factorRow) {
    throw new Error(`no SECTOR_FACTORS_daily row for sector=${sector} date=${sectorDate}`);
  }

  let macroBlob = null;
  try { macroBlob = macroRow?.summary ? JSON.parse(macroRow.summary) : null; } catch { macroBlob = null; }

  // Target sector factors, cleaned up.
  const factors = {
    regime_fit:           _round(factorRow.regime_fit, 3),
    earn_momentum:        _round(factorRow.earn_momentum, 4),
    beat_rate_sector:     _round(factorRow.beat_rate_sector, 3),
    valuation_sigma:      _round(factorRow.valuation_sigma, 3),
    rel_strength_13w:     _round(factorRow.rel_strength_13w, 4),
    rs_ratio:             _round(factorRow.rs_ratio, 2),
    rs_momentum:          _round(factorRow.rs_momentum, 2),
    breadth_above_200dma: _round(factorRow.breadth_above_200dma, 3),
    fwd_pe_sector:        _round(factorRow.fwd_pe_sector, 2),
    stance:               factorRow.stance,
    stance_score:         _round(factorRow.stance_score, 4),
  };

  const peers = (peersRes.results || []).map((p) => ({
    sector:           p.sector,
    stance:           p.stance,
    stance_score:     _round(p.stance_score, 4),
    regime_fit:       _round(p.regime_fit, 3),
    rel_strength_13w: _round(p.rel_strength_13w, 4),
    valuation_sigma:  _round(p.valuation_sigma, 3),
    fwd_pe_sector:    _round(p.fwd_pe_sector, 2),
  }));

  const constituents = (tickersRes.results || []).map((t) => ({
    ticker: t.ticker,
    score:  _round(t.score, 3),
    stock_factors: {
      rs_vs_sector_3m:   _round(t.rs_vs_sector_3m, 3),
      mom_12_1:          _round(t.mom_12_1, 3),
      fwd_pe:            _round(t.fwd_pe, 2),
      rel_pe_sigma:      _round(t.rel_pe_sigma, 2),
      peer_median_pe:    _round(t.peer_median_pe, 2),
      eps_rev_4w:        _round(t.eps_rev_4w, 4),
      rev_breadth_4w:    _round(t.rev_breadth_4w, 3),
      sue:               _round(t.sue, 3),
      piotroski_f:       t.piotroski_f,
      days_to_catalyst:  t.days_to_catalyst,
      short_pct_float:   _round(t.short_pct_float, 2),
    },
  }));

  const news = (newsRes.results || []).map((n) => ({
    date: n.date,
    ticker: n.ticker,
    title: n.title,
    summary: _truncate(n.summary, 260),
    sentiment: n.sentiment,
    magnitude: n.magnitude,
  }));

  const earnings = (earningsRes.results || []).map((e) => ({
    ticker: e.ticker,
    period: e.period,
    report_date: e.report_date,
    estimate: _round(e.estimate, 3),
  }));

  // Regime & landscape context — just the top bullet each, for prompt anchor.
  let regimeTopBullet = null;
  try { regimeTopBullet = regimeIdRow?.content?.bullets?.[0] || null; } catch { regimeTopBullet = null; }
  let landscapeTopBullet = null;
  try { landscapeTopBullet = landscapeIdRow?.content?.bullets?.[0] || null; } catch { landscapeTopBullet = null; }

  // Numeric snapshot for stability gate — tracks the inputs that, if moved
  // enough, should trigger a re-build.
  const top3 = constituents.slice(0, 3).map((c) => c.ticker);
  const numeric_snapshot = {
    stance_score:     factors.stance_score,
    regime_fit:       factors.regime_fit,
    valuation_sigma:  factors.valuation_sigma,
    rel_strength_13w: factors.rel_strength_13w,
    earn_momentum:    factors.earn_momentum,
    stance:           factors.stance,
    top_3_tickers:    top3,
  };

  const input = {
    as_of: today,
    sector_date: sectorDate,
    sector,
    factors,
    peers,
    constituents,
    news,
    earnings,
    regime: {
      label: macroBlob?.trend?.regime ?? null,
      top_bullet: regimeTopBullet,
    },
    landscape: {
      top_bullet: landscapeTopBullet,
    },
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
    sector,
    factors: [factors.stance, factors.stance_score, factors.regime_fit, factors.valuation_sigma, factors.rel_strength_13w],
    top3,
    regime_label: numeric_snapshot.regime_label,
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
