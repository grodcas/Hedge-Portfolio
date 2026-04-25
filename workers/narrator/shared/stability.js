// Stability check — returns STABLE if the input hasn't moved enough to
// justify a fresh LLM call. Cheaper for the project and keeps confirmation
// bars honest on the dashboard.
//
// Two layers:
//  1. input_hash — exact-match short-circuit. Same hash as last run → STABLE.
//  2. threshold check — numerical drift per key metric below a per-metric
//     tolerance → STABLE even if hash differs (e.g. a news blurb changed but
//     the regime inputs didn't).

export function hashStable(prevHash, currentHash) {
  return prevHash && currentHash && prevHash === currentHash;
}

// Regime thresholds per NARRATIVE_BUILD_PLAN.md Sprint 1.
// A single breach trips the whole check to MOVED. All breaches reported for
// logging.
export function regimeStability(prev, curr) {
  if (!prev) return { stable: false, reason: "no_prior" };
  const breaches = [];
  check(breaches, "core_cpi_yoy", prev.core_cpi_yoy, curr.core_cpi_yoy, 0.2);
  check(breaches, "gdp_nowcast",  prev.gdp_nowcast,  curr.gdp_nowcast,  0.3);
  check(breaches, "ten_y",        prev.ten_y,        curr.ten_y,        0.15);
  check(breaches, "hy_spread",    prev.hy_spread,    curr.hy_spread,    0.20); // in pp
  check(breaches, "vix",          prev.vix,          curr.vix,          3.0);

  if (breaches.length === 0) {
    return { stable: true, reason: "all_within_threshold", breaches };
  }
  return { stable: false, reason: "breach", breaches };
}

function check(out, key, a, b, tol) {
  if (a === null || a === undefined || b === null || b === undefined) return;
  const delta = Math.abs(Number(b) - Number(a));
  if (Number.isNaN(delta)) return;
  if (delta > tol) out.push({ key, prev: a, curr: b, delta: +delta.toFixed(4), tol });
}

// Sector-landscape stability per NARRATIVE_BUILD_PLAN.md Sprint 2:
// "no sector's regime_fit moved >0.2; no stance change. Then reuse."
// We read stance_scores (composite) and stance labels from the snapshot.
// Thresholds: stance_score drift > 0.15 OR any stance label change.
export function sectorLandscapeStability(prev, curr) {
  if (!prev || !prev.stance_scores) return { stable: false, reason: "no_prior" };
  const breaches = [];
  const prevScores = prev.stance_scores || {};
  const currScores = curr.stance_scores || {};
  const sectors = new Set([...Object.keys(prevScores), ...Object.keys(currScores)]);
  for (const s of sectors) {
    check(breaches, `stance_score:${s}`, prevScores[s], currScores[s], 0.15);
  }
  const prevLabels = prev.stance_labels || {};
  const currLabels = curr.stance_labels || {};
  for (const s of sectors) {
    const a = prevLabels[s], b = currLabels[s];
    if (a != null && b != null && a !== b) {
      breaches.push({ key: `stance:${s}`, prev: a, curr: b });
    }
  }
  if (breaches.length === 0) return { stable: true, reason: "all_within_threshold", breaches };
  return { stable: false, reason: "breach", breaches };
}

// Per-stock stability per NARRATIVE_BUILD_PLAN.md Sprint 5:
// "No factor flipped sign, composite score moved <0.25, no new earnings /
//  8-K / Form 4 in window."
// We read numeric_snapshot_at_write from the previous ident_long row.
export function stockStability(prev, curr) {
  if (!prev) return { stable: false, reason: "no_prior" };
  const breaches = [];

  // Composite score drift.
  check(breaches, "score", prev.score, curr.score, 0.25);

  // Factor-sign flip: any key present in both must match.
  const prevSigns = prev.factor_signs || {};
  const currSigns = curr.factor_signs || {};
  for (const k of new Set([...Object.keys(prevSigns), ...Object.keys(currSigns)])) {
    const a = prevSigns[k], b = currSigns[k];
    if (a == null || b == null) continue;
    if (a !== b) breaches.push({ key: `factor_sign:${k}`, prev: a, curr: b });
  }

  // New filings in window.
  if (prev.latest_earnings_date !== curr.latest_earnings_date) {
    breaches.push({ key: "new_earnings", prev: prev.latest_earnings_date, curr: curr.latest_earnings_date });
  }
  if (prev.latest_8k_date !== curr.latest_8k_date) {
    breaches.push({ key: "new_8k", prev: prev.latest_8k_date, curr: curr.latest_8k_date });
  }
  if (prev.latest_form4_date !== curr.latest_form4_date) {
    breaches.push({ key: "new_form4", prev: prev.latest_form4_date, curr: curr.latest_form4_date });
  }

  if (breaches.length === 0) return { stable: true, reason: "all_within_threshold", breaches };
  return { stable: false, reason: "breach", breaches };
}

// Stock-landscape stability per NARRATIVE_BUILD_PLAN.md Sprint 4:
// "Shortlist unchanged AND no score moved >0.15 AND no probability crossed 0.1."
// Shortlist set is order-insensitive; a composition change trips the gate.
export function stockLandscapeStability(prev, curr) {
  if (!prev || !prev.shortlist_tickers) return { stable: false, reason: "no_prior" };
  const breaches = [];

  const prevSet = new Set(prev.shortlist_tickers || []);
  const currSet = new Set(curr.shortlist_tickers || []);
  const sameSize = prevSet.size === currSet.size;
  const sameMembers = sameSize && [...prevSet].every((t) => currSet.has(t));
  if (!sameMembers) {
    breaches.push({
      key: "shortlist_tickers",
      prev: [...prevSet],
      curr: [...currSet],
    });
  }

  const prevScores = prev.scores || {};
  const currScores = curr.scores || {};
  for (const t of currSet) {
    check(breaches, `score:${t}`, prevScores[t], currScores[t], 0.15);
  }

  const prevProb = prev.probabilities || {};
  const currProb = curr.probabilities || {};
  for (const t of currSet) {
    const a = prevProb[t];
    const b = currProb[t];
    if (!a || !b) continue;
    check(breaches, `p_favorable:${t}`,   a.favorable,   b.favorable,   0.10);
    check(breaches, `p_neutral:${t}`,     a.neutral,     b.neutral,     0.10);
    check(breaches, `p_unfavorable:${t}`, a.unfavorable, b.unfavorable, 0.10);
  }

  if (breaches.length === 0) return { stable: true, reason: "all_within_threshold", breaches };
  return { stable: false, reason: "breach", breaches };
}

// Per-sector stability per NARRATIVE_BUILD_PLAN.md Sprint 3:
// "no factor moved >0.2, no top 3 tickers changed".
// We compare numeric_snapshot_at_write captured on the previous identification
// row against the current input's numeric_snapshot.
//
// Breach triggers:
//   stance_score drift > 0.15
//   regime_fit drift > 0.20
//   valuation_sigma drift > 0.30
//   rel_strength_13w drift > 0.20
//   earn_momentum drift > 0.15
//   stance label flip (OW/EW/UW)
//   top_3_tickers set changes (order-insensitive)
export function sectorStability(prev, curr) {
  if (!prev) return { stable: false, reason: "no_prior" };
  const breaches = [];

  check(breaches, "stance_score",     prev.stance_score,     curr.stance_score,     0.15);
  check(breaches, "regime_fit",       prev.regime_fit,       curr.regime_fit,       0.20);
  check(breaches, "valuation_sigma",  prev.valuation_sigma,  curr.valuation_sigma,  0.30);
  check(breaches, "rel_strength_13w", prev.rel_strength_13w, curr.rel_strength_13w, 0.20);
  check(breaches, "earn_momentum",    prev.earn_momentum,    curr.earn_momentum,    0.15);

  if (prev.stance != null && curr.stance != null && prev.stance !== curr.stance) {
    breaches.push({ key: "stance", prev: prev.stance, curr: curr.stance });
  }

  const prevTop = new Set(prev.top_3_tickers || []);
  const currTop = new Set(curr.top_3_tickers || []);
  const sameSize = prevTop.size === currTop.size;
  const sameMembers = sameSize && [...prevTop].every((t) => currTop.has(t));
  if (!sameMembers) {
    breaches.push({
      key: "top_3_tickers",
      prev: [...prevTop],
      curr: [...currTop],
    });
  }

  if (breaches.length === 0) return { stable: true, reason: "all_within_threshold", breaches };
  return { stable: false, reason: "breach", breaches };
}
