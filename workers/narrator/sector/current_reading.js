// Deterministic per-sector reading composer.
//
// Three factual lines, no LLM:
//   Line 1: stance + stance_score + rank vs the 8 peers.
//   Line 2: the two strongest and two weakest factor drivers (named, values cited).
//   Line 3: top-3 constituents by composite score (names + scores).

export function composeSectorReading(input) {
  const sector = input.sector;
  const f = input.factors || {};
  const peers = input.peers || [];
  const lines = [];

  // Line 1 — stance + rank.
  const rank = 1 + peers.findIndex((p) => p.sector === sector);
  const rankText = rank >= 1 ? `#${rank} of ${peers.length}` : "rank n/a";
  lines.push(
    `${sector} stance ${f.stance ?? "n/a"} (score ${fmt(f.stance_score, 2)}) — ${rankText} by stance_score.`
  );

  // Line 2 — factor attribution: top 2 positives, top 2 negatives.
  const factorEntries = [
    ["regime_fit",           f.regime_fit],
    ["earn_momentum",        f.earn_momentum],
    ["valuation_sigma",      f.valuation_sigma],
    ["rel_strength_13w",     f.rel_strength_13w],
    ["breadth_above_200dma", f.breadth_above_200dma],
  ].filter(([, v]) => v != null);

  const sortedPos = [...factorEntries].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const sortedNeg = [...factorEntries].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  const posParts = sortedPos.slice(0, 2).map(([k, v]) => `${k} ${fmtSigned(v, 2)}`);
  const negParts = sortedNeg.slice(0, 2).filter(([k, v]) => (v ?? 0) < 0).map(([k, v]) => `${k} ${fmtSigned(v, 2)}`);
  if (posParts.length) {
    lines.push(
      negParts.length
        ? `Support: ${posParts.join(", ")}. Drag: ${negParts.join(", ")}.`
        : `Support: ${posParts.join(", ")}. No negative factor drivers.`
    );
  }

  // Line 3 — top 3 constituents.
  const top3 = (input.constituents || []).slice(0, 3);
  if (top3.length) {
    const parts = top3.map((c) => `${c.ticker} ${fmt(c.score, 2)}`);
    lines.push(`Top constituents by composite score: ${parts.join(", ")}.`);
  }

  return { text: lines.join(" "), lines };
}

function fmt(n, p) {
  if (n == null || !Number.isFinite(Number(n))) return "n/a";
  return Number(n).toFixed(p);
}

function fmtSigned(n, p) {
  if (n == null || !Number.isFinite(Number(n))) return "n/a";
  const s = Number(n).toFixed(p);
  return Number(n) >= 0 ? `+${s}` : s;
}
