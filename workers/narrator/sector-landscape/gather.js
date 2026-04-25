// Sector-landscape gatherer — reads SECTOR_FACTORS_daily for every sector
// on the latest date, joins the top-scoring ticker per sector from
// SIGNAL_01_Assessment + STOCK_FACTORS_daily, pulls 7d sector-level news via
// the news→ticker→sector path, and embeds the regime label + top regime
// identification bullet as macro context.
//
// Schema produced:
//   {
//     as_of:       ISO date (today),
//     sectors:     [{ sector, regime_fit, earn_momentum, valuation_sigma,
//                     rel_strength_13w, breadth_above_200dma, stance,
//                     stance_score, fwd_pe_sector, rs_ratio, rs_momentum,
//                     top_tickers: [{ ticker, score }] }],
//     regime:      { label, top_bullet },
//     news:        { <sector>: [{ date, ticker, title, summary, sentiment, magnitude }] },
//     calendar:    [{ event_date, event_label }],  // reused from regime build
//     previous:    { current_reading?, identification?, recommendation?, lede?, input_hash? },
//     numeric_snapshot: { stance_scores: { <sector>: score }, regime_label, widest_spread }
//   }
//
// Sector set: whatever SECTOR_FACTORS_daily has on the latest date. Today
// that is the 8-sector set (Technology, Communication, ConsDisc, Finance,
// Energy, Healthcare, Staples, Industrial). The Sprint-3 rename into
// TechHardware / TechSoftware / TechDigitalConsumer will land here when the
// upstream sector-factor-builder is updated.

import { fetchLatest } from "../shared/sql.js";
import { hashInput } from "../shared/hash.js";

export async function gatherLandscapeInputs(db) {
  const today = new Date().toISOString().slice(0, 10);

  // Latest date in SECTOR_FACTORS_daily (independent of today — sector factors
  // are only built on trading days).
  const maxRow = await db
    .prepare(`SELECT MAX(date) AS d FROM SECTOR_FACTORS_daily`)
    .first();
  const sectorDate = maxRow?.d || today;

  const [sectorsRes, tickersRes, newsRes, calRes, macroRow, prevCR, prevId, prevRec, prevLede, regimeIdRow] = await Promise.all([
    db.prepare(`
      SELECT sector, date, regime_fit, earn_momentum, beat_rate_sector,
             valuation_sigma, rel_strength_13w, rs_ratio, rs_momentum,
             stance, stance_score, fwd_pe_sector, breadth_above_200dma
        FROM SECTOR_FACTORS_daily
        WHERE date = ?
        ORDER BY stance_score DESC
    `).bind(sectorDate).all(),
    db.prepare(`
      SELECT sf.sector, sa.ticker, sa.score
        FROM SIGNAL_01_Assessment sa
        JOIN STOCK_FACTORS_daily sf
          ON sa.ticker = sf.ticker
         AND sf.date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
        WHERE sa.date = (SELECT MAX(date) FROM SIGNAL_01_Assessment)
        ORDER BY sf.sector, sa.score DESC
    `).all(),
    db.prepare(`
      SELECT n.date, n.ticker, n.title, n.summary, n.category, n.rank,
             n.sentiment, n.magnitude, sf.sector
        FROM BETA_12_News_digest n
        LEFT JOIN STOCK_FACTORS_daily sf
          ON sf.ticker = n.ticker
         AND sf.date = (SELECT MAX(date) FROM STOCK_FACTORS_daily)
        WHERE n.date >= date('now', '-7 days')
          AND n.ticker IS NOT NULL
        ORDER BY n.date DESC, n.rank ASC
        LIMIT 200
    `).all(),
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
    fetchLatest(db, { entity_type: "sector_landscape", entity_id: null, field: "current_reading" }),
    fetchLatest(db, { entity_type: "sector_landscape", entity_id: null, field: "identification" }),
    fetchLatest(db, { entity_type: "sector_landscape", entity_id: null, field: "recommendation" }),
    fetchLatest(db, { entity_type: "sector_landscape", entity_id: null, field: "lede" }),
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "identification" }),
  ]);

  let macroBlob = null;
  try { macroBlob = macroRow?.summary ? JSON.parse(macroRow.summary) : null; } catch { macroBlob = null; }

  // Group top tickers per sector (top 3).
  const tickersBySector = {};
  for (const r of tickersRes.results || []) {
    if (!tickersBySector[r.sector]) tickersBySector[r.sector] = [];
    if (tickersBySector[r.sector].length < 3) {
      tickersBySector[r.sector].push({ ticker: r.ticker, score: _round(r.score, 3) });
    }
  }

  // Group 7d news per sector (keep only news whose ticker maps to a sector).
  // Cap 8 items per sector so the prompt stays small.
  const newsBySector = {};
  for (const n of newsRes.results || []) {
    if (!n.sector) continue;
    if (!newsBySector[n.sector]) newsBySector[n.sector] = [];
    if (newsBySector[n.sector].length >= 8) continue;
    newsBySector[n.sector].push({
      date: n.date,
      ticker: n.ticker,
      title: n.title,
      summary: _truncate(n.summary, 260),
      sentiment: n.sentiment,
      magnitude: n.magnitude,
    });
  }

  // Shape sector rows for the prompt (drop flow_5d which is eternally null).
  const sectors = (sectorsRes.results || []).map((s) => ({
    sector: s.sector,
    regime_fit:           _round(s.regime_fit, 3),
    earn_momentum:        _round(s.earn_momentum, 4),
    beat_rate_sector:     _round(s.beat_rate_sector, 3),
    valuation_sigma:      _round(s.valuation_sigma, 3),
    rel_strength_13w:     _round(s.rel_strength_13w, 4),
    rs_ratio:             _round(s.rs_ratio, 2),
    rs_momentum:          _round(s.rs_momentum, 2),
    breadth_above_200dma: _round(s.breadth_above_200dma, 3),
    fwd_pe_sector:        _round(s.fwd_pe_sector, 2),
    stance:               s.stance,
    stance_score:         _round(s.stance_score, 4),
    top_tickers:          tickersBySector[s.sector] || [],
  }));

  // Numeric snapshot used by the stability gate.
  const stance_scores = Object.fromEntries(sectors.map((s) => [s.sector, s.stance_score]));
  const stance_labels = Object.fromEntries(sectors.map((s) => [s.sector, s.stance]));
  const scoreVals = sectors.map((s) => s.stance_score).filter((v) => v != null);
  const widest_spread = scoreVals.length >= 2
    ? +(Math.max(...scoreVals) - Math.min(...scoreVals)).toFixed(4)
    : null;
  const numeric_snapshot = {
    stance_scores,
    stance_labels,
    regime_label: macroBlob?.trend?.regime ?? null,
    widest_spread,
  };

  // Regime context for the prompt: label + top identification bullet.
  let regimeTopBullet = null;
  try {
    const parsed = regimeIdRow?.content;
    regimeTopBullet = parsed?.bullets?.[0] || null;
  } catch { regimeTopBullet = null; }

  const input = {
    as_of: today,
    sector_date: sectorDate,
    sectors,
    regime: {
      label: numeric_snapshot.regime_label,
      top_bullet: regimeTopBullet,
    },
    news: newsBySector,
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
    sectors: sectors.map((s) => [s.sector, s.stance_score, s.stance, s.regime_fit]),
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
