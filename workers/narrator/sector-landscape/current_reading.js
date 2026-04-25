// Deterministic comparative-reading composer for the sector landscape.
//
// Three factual lines, no LLM:
//   Line 1: how many sectors, OW list with avg regime_fit, UW list with avg regime_fit.
//   Line 2: widest stance_score spread (top vs bottom) + sector names at each end.
//   Line 3: best / worst on rel_strength_13w so the reader sees near-term tape too.

export function composeLandscapeReading(input) {
  const sectors = input.sectors || [];
  const lines = [];

  if (!sectors.length) {
    return { text: "No sector factor data available.", lines: ["No sector factor data available."] };
  }

  const ow = sectors.filter((s) => s.stance === "OW");
  const uw = sectors.filter((s) => s.stance === "UW");
  const ew = sectors.filter((s) => s.stance === "EW");

  const fmtList = (arr) => arr.map((s) => s.sector).join(", ") || "—";
  const avgFit = (arr) => arr.length
    ? +((arr.reduce((a, s) => a + (s.regime_fit ?? 0), 0) / arr.length).toFixed(2))
    : null;

  const line1 = `${sectors.length} sectors assessed. OW: ${fmtList(ow)} (avg regime-fit ${avgFit(ow) ?? "n/a"}); EW: ${fmtList(ew)}; UW: ${fmtList(uw)} (avg regime-fit ${avgFit(uw) ?? "n/a"}).`;
  lines.push(line1);

  // Widest spread in stance_score.
  const sorted = [...sectors].sort((a, b) => (b.stance_score ?? -Infinity) - (a.stance_score ?? -Infinity));
  const top = sorted[0];
  const bot = sorted[sorted.length - 1];
  const spread = (top.stance_score != null && bot.stance_score != null)
    ? +(top.stance_score - bot.stance_score).toFixed(2)
    : null;
  if (spread != null) {
    lines.push(`Widest stance-score spread ${spread} (${top.sector} ${top.stance_score?.toFixed(2)} vs ${bot.sector} ${bot.stance_score?.toFixed(2)}).`);
  }

  // Near-term tape: best / worst rel_strength_13w.
  const byRs = [...sectors].filter((s) => s.rel_strength_13w != null).sort((a, b) => b.rel_strength_13w - a.rel_strength_13w);
  if (byRs.length >= 2) {
    const best = byRs[0];
    const worst = byRs[byRs.length - 1];
    const pp = (v) => `${(v * 100).toFixed(1)}pp`;
    lines.push(`13-wk rel-strength leader ${best.sector} (${pp(best.rel_strength_13w)}); laggard ${worst.sector} (${pp(worst.rel_strength_13w)}).`);
  }

  return { text: lines.join(" "), lines };
}
