// Deterministic comparative reading for the stock landscape.
//
// Three factual lines, no LLM:
//   Line 1: shortlist size, median score, widest score spread (top vs bottom).
//   Line 2: sector breakdown — how many shortlisted per sector + top-ranked per sector.
//   Line 3: highest-conviction probability (p_favorable) and the weakest (lowest p_fav).

export function composeStockLandscapeReading(input) {
  const sl = input.shortlist || [];
  const lines = [];

  if (!sl.length) {
    return { text: "No stock shortlist available.", lines: ["No stock shortlist available."] };
  }

  // Line 1 — shortlist size, median score, widest spread.
  const scores = sl.map((s) => s.score).filter((v) => v != null).sort((a, b) => a - b);
  const median = scores.length
    ? (scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : null;
  const spread = scores.length >= 2
    ? +(scores[scores.length - 1] - scores[0]).toFixed(3)
    : null;
  const top = sl[0];
  const bot = sl[sl.length - 1];
  lines.push(
    `${sl.length} stocks shortlisted. Median composite score ${fmt(median, 2)}, spread ${fmt(spread, 2)} (${top.ticker} ${fmt(top.score, 2)} vs ${bot.ticker} ${fmt(bot.score, 2)}).`
  );

  // Line 2 — sector breakdown. Top-ranked per sector.
  const bySector = {};
  for (const s of sl) {
    if (!s.sector) continue;
    if (!bySector[s.sector]) bySector[s.sector] = [];
    bySector[s.sector].push(s);
  }
  const sectorSummary = Object.entries(bySector)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([sec, arr]) => `${sec} ${arr.length} (top ${arr[0].ticker} ${fmt(arr[0].score, 2)})`)
    .join("; ");
  if (sectorSummary) {
    lines.push(`Sector coverage: ${sectorSummary}.`);
  }

  // Line 3 — strongest / weakest probability of favorable.
  const withProb = sl.filter((s) => s.probability?.p_favorable != null);
  if (withProb.length >= 2) {
    const sorted = [...withProb].sort((a, b) => b.probability.p_favorable - a.probability.p_favorable);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    lines.push(
      `Strongest probability-of-favorable: ${best.ticker} ${pct(best.probability.p_favorable)}; weakest: ${worst.ticker} ${pct(worst.probability.p_favorable)}.`
    );
  }

  return { text: lines.join(" "), lines };
}

function fmt(n, p) {
  if (n == null || !Number.isFinite(Number(n))) return "n/a";
  return Number(n).toFixed(p);
}

function pct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "n/a";
  return `${(Number(v) * 100).toFixed(0)}%`;
}
