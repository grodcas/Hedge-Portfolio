// Regime gatherer — pulls every input the regime narrator needs from D1
// into a single JSON block ready for prompts + stability check.
//
// Schema produced:
//   {
//     as_of:      ISO date (today),
//     indicators: [{ code, name, value, prior, unit, release_date, period,
//                    direction_30d: "rising" | "falling" | "flat",
//                    history_30d: [{ date, value }] }],
//     macro_blob: {...}              // latest BETA_10_Daily_macro.summary
//     fomc:       [{ meeting_date, title, decision_summary, statement_text }],
//     whitehouse: [{ date, title, summary }],
//     news:       [{ date, category, rank, title, summary, sentiment, magnitude, source }],
//     calendar:   [{ event_date, event_code, event_label }],
//     previous:   { current_reading?, identification?, recommendation?, lede?, input_hash? },
//     numeric_snapshot: {            // used by stability.js — stable field order
//       core_cpi_yoy, gdp_nowcast, ten_y, two_y, hy_spread, vix, regime_label
//     }
//   }

import { fetchLatest } from "../shared/sql.js";
import { hashInput } from "../shared/hash.js";

// Indicators available in MACRO_STATE_indicators + what we can derive.
//
// IMPORTANT: CPI_CORE and CPI_HEADLINE are stored as INDEX LEVELS (unit
// 'index'), not YoY percent changes. We compute YoY from the 12-months-ago
// value in the history — if unavailable, the indicator reports null rather
// than citing the raw index level (which a reader could misinterpret as a
// rate).
//
// Indicators NOT currently captured in D1: GDP nowcast, VIX, HY spread,
// DXY, Brent/WTI. Those come from external feeds not yet wired. They go
// into missing_factors naturally and the narrator signals the gap.
const INDICATOR_MAP = [
  { label: "Core CPI YoY",   code: "CPI_CORE", yoyFromIndex: true },
  { label: "Headline CPI YoY", code: "CPI_HEADLINE", yoyFromIndex: true },
  { label: "10Y Yield",      code: "DGS10" },
  { label: "2Y Yield",       code: "DGS2" },
  // 2s10s reported in BASIS POINTS (industry standard)
  { label: "Curve (2s10s)",  code: null, unit: "bp", derive: (idx) => idx.DGS10 != null && idx.DGS2 != null ? Math.round((idx.DGS10 - idx.DGS2) * 100) : null },
  { label: "Fed Funds",      code: "FEDFUNDS" },
  // NFP is stored as total payrolls (~158M). Analysts mean monthly change.
  // Transform: value = current_total - prior_total.
  { label: "NFP (m/m change)", code: "NFP", monthlyChange: true },
  { label: "Unemployment",   code: "UNEMP" },
  { label: "Fed Target Upper", code: "FED_TARGET_UPPER" },
  { label: "Fed Target Lower", code: "FED_TARGET_LOWER" },
];

export async function gatherRegimeInputs(db) {
  const today = new Date().toISOString().slice(0, 10);

  const [macroRow, indicatorsRes, fomcRes, whRes, newsRes, calRes, prevCR, prevId, prevRec, prevLede] = await Promise.all([
    db.prepare(`SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1`).first(),
    db.prepare(`
      SELECT indicator_code AS code, indicator_name AS name, value, prior, unit, release_date, period
        FROM MACRO_STATE_indicators
        ORDER BY release_date DESC
        LIMIT 300
    `).all(),
    db.prepare(`
      SELECT meeting_date, title, decision_summary, statement_text, source_url
        FROM MACRO_STATE_fomc
        ORDER BY meeting_date DESC LIMIT 4
    `).all(),
    db.prepare(`
      SELECT date, title, summary
        FROM BETA_02_WH
        WHERE date >= date('now', '-7 days')
        ORDER BY date DESC LIMIT 30
    `).all(),
    db.prepare(`
      SELECT date, category, rank, title, summary, impact, source, sentiment, magnitude
        FROM BETA_12_News_digest
        WHERE date >= date('now', '-7 days')
          AND (type = 'macro' OR category IN ('geopolitics','trade','central_banks','regulation','fiscal'))
        ORDER BY date DESC, rank ASC LIMIT 40
    `).all(),
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
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "current_reading" }),
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "identification" }),
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "recommendation" }),
    fetchLatest(db, { entity_type: "regime", entity_id: null, field: "lede" }),
  ]);

  // Parse the macro blob.
  let macroBlob = null;
  try {
    macroBlob = macroRow?.summary ? JSON.parse(macroRow.summary) : null;
  } catch { macroBlob = null; }

  // Group MACRO_STATE_indicators by code → chronological history.
  const byCode = {};
  for (const r of (indicatorsRes.results || [])) {
    if (!byCode[r.code]) byCode[r.code] = [];
    byCode[r.code].push(r);
  }
  // Already ordered DESC; we just pick the latest + compute 30d direction.
  const latestByCode = {};
  for (const code of Object.keys(byCode)) {
    const rows = byCode[code];
    latestByCode[code] = rows[0];
  }

  const indicators = INDICATOR_MAP.map((spec) => {
    let value = null;
    let prior = null;
    let unit = spec.unit || null;
    let release_date = null;
    let period = null;
    let name = spec.label;
    let history_30d = [];

    if (spec.code && latestByCode[spec.code]) {
      const r = latestByCode[spec.code];
      unit = unit || r.unit;
      release_date = r.release_date;
      period = r.period;
      name = spec.label; // use our human label, not the DB indicator_name

      if (spec.monthlyChange) {
        // Convert raw total to monthly delta.
        if (r.value != null && r.prior != null) {
          value = Math.round(r.value - r.prior);
          prior = null; // we'd need two prior deltas to show month-over-month of deltas
          // Build history as first-differences of the level series
          const cutoff = _dateMinusDays(release_date, 180);
          const levels = (byCode[spec.code] || [])
            .filter((x) => x.release_date >= cutoff)
            .sort((a, b) => a.release_date.localeCompare(b.release_date));
          history_30d = [];
          for (let k = 1; k < levels.length; k++) {
            if (levels[k].value != null && levels[k - 1].value != null) {
              history_30d.push({ date: levels[k].release_date, value: Math.round(levels[k].value - levels[k - 1].value) });
            }
          }
        } else {
          value = null;
        }
      } else if (spec.yoyFromIndex) {
        // Compute YoY from 12-months-ago index value.
        // History stored DESC by release_date → find row ~365 days prior.
        const targetCutoff = _dateMinusDays(r.release_date, 365);
        const yearAgo = (byCode[spec.code] || []).find((x) => x.release_date <= targetCutoff);
        if (yearAgo && yearAgo.value && r.value) {
          value = +((r.value / yearAgo.value - 1) * 100).toFixed(2);
          prior = null; // prior comparison is YoY-vs-YoY; skip unless we compute it from two series
          unit = "%";
          // Rebuild history_30d as YoY series too (optional — use raw index differences)
          history_30d = [];
        } else {
          value = null; // insufficient history for YoY — degrade gracefully
        }
      } else {
        value = r.value;
        prior = r.prior;
        // Build 30d history (prior 30 calendar days from release_date)
        const cutoff = _dateMinusDays(release_date, 30);
        history_30d = (byCode[spec.code] || [])
          .filter((x) => x.release_date >= cutoff)
          .map((x) => ({ date: x.release_date, value: x.value }));
      }
    } else if (spec.derive) {
      const idxValues = _latestValueMap(latestByCode);
      value = spec.derive(idxValues);
    }

    return {
      code: spec.code,
      label: spec.label,
      name,
      value,
      prior,
      unit,
      release_date,
      period,
      direction_30d: _direction(history_30d, value),
      history_30d,
    };
  }).filter((i) => i.value !== null); // drop indicators where data is unavailable

  // Build the stable numeric snapshot for stability check.
  const byLabel = Object.fromEntries(indicators.map((i) => [i.label, i.value]));
  const numeric_snapshot = {
    core_cpi_yoy: _num(byLabel["Core CPI YoY"]),
    gdp_nowcast:  _num(byLabel["GDP Nowcast"]),
    ten_y:        _num(byLabel["10Y Yield"]),
    two_y:        _num(byLabel["2Y Yield"]),
    hy_spread:    _num(byLabel["HY Spread"]),
    vix:          _num(byLabel["VIX"]),
    regime_label: macroBlob?.trend?.regime ?? null,
  };

  const input = {
    as_of: today,
    indicators,
    macro_blob: macroBlob,
    fomc: (fomcRes.results || []).map((f) => ({
      meeting_date: f.meeting_date,
      title: f.title,
      decision_summary: f.decision_summary,
      // Statement text is long — truncate for prompt payload; fact-checker
      // can request the full text via source.id if needed.
      statement_excerpt: _truncate(f.statement_text, 1500),
      source_url: f.source_url,
    })),
    whitehouse: (whRes.results || []).map((w) => ({
      date: w.date,
      title: w.title,
      summary: _truncate(w.summary, 400),
    })),
    news: (newsRes.results || []).map((n) => ({
      date: n.date,
      category: n.category,
      rank: n.rank,
      title: n.title,
      summary: _truncate(n.summary, 300),
      impact: n.impact,
      source: n.source,
      sentiment: n.sentiment,
      magnitude: n.magnitude,
    })),
    // Sprint 11: calendar comes from MACRO_STATE_calendar (Finnhub-sourced),
    // not the GPT-generated BETA_10_Daily_macro.catalysts[] which was prone
    // to date hallucination. Recommendation prompt reads event_date /
    // event_code / event_label to build signposts with verifiable dates.
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
    indicators: indicators.map((i) => [i.label, i.value]),
    macro_regime: numeric_snapshot.regime_label,
    // Don't hash news / whitehouse / calendar — those change constantly and
    // would make stability-check useless.
  });

  return input;
}

function _latestValueMap(latestByCode) {
  const out = {};
  for (const code of Object.keys(latestByCode)) out[code] = latestByCode[code].value;
  return out;
}

function _direction(history, current) {
  if (!history || history.length < 2 || current == null) return "flat";
  const oldest = history[history.length - 1];
  if (oldest?.value == null) return "flat";
  const diff = current - oldest.value;
  const tol = Math.max(0.01, Math.abs(oldest.value) * 0.01);
  if (diff > tol) return "rising";
  if (diff < -tol) return "falling";
  return "flat";
}

function _truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function _num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _dateMinusDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
