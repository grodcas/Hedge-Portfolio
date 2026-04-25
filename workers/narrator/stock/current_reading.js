// Deterministic per-stock reading composer — 3 factual lines.
//   Line 1: composite score + probability triplet + latest stance.
//   Line 2: top 2 scoring factors (by |value|×weight) with reasons.
//   Line 3: latest earnings surprise + next catalyst in N days.

export function composeStockReading(input) {
  const ticker = input.ticker;
  const a = input.assessment || {};
  const p = input.probability?.latest || null;
  const sf = input.stock_factors || {};
  const lines = [];

  // Line 1 — score + probability.
  const probStr = p
    ? `p(fav/neu/unfav)=${pct(p.p_favorable)}/${pct(p.p_neutral)}/${pct(p.p_unfavorable)}`
    : "no probability row";
  lines.push(`${ticker} composite score ${fmt(a.score, 2)} · ${probStr}.`);

  // Line 2 — top 2 impactful factors.
  const topFactors = [...(a.factors || [])]
    .map((f) => ({ ...f, impact: Math.abs((f.value ?? 0) * (f.weight ?? 1)) }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2)
    .filter((f) => f.impact > 0);
  if (topFactors.length) {
    const parts = topFactors.map((f) => `${f.name} ${sign(f.value)} (w=${f.weight}, ${truncate(f.reason, 60)})`);
    lines.push(`Top drivers: ${parts.join("; ")}.`);
  }

  // Line 3 — latest earnings + next catalyst.
  const latestE = (input.earnings || [])[0];
  const surprise = latestE?.surprise_pct != null
    ? `${latestE.surprise_pct >= 0 ? "+" : ""}${latestE.surprise_pct}%`
    : null;
  const daysCat = sf.days_to_catalyst;
  const parts3 = [];
  if (latestE && surprise) {
    parts3.push(`Last earnings ${latestE.period} reported ${latestE.report_date}, surprise ${surprise}`);
  }
  if (daysCat != null) parts3.push(`next catalyst in ${daysCat}d`);
  if (parts3.length) lines.push(parts3.join("; ") + ".");

  return { text: lines.join(" "), lines };
}

function fmt(n, p) {
  if (n == null || !Number.isFinite(Number(n))) return "n/a";
  return Number(n).toFixed(p);
}
function sign(v) {
  if (v == null) return "n/a";
  return Number(v) >= 0 ? `+${v}` : `${v}`;
}
function pct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "n/a";
  return `${(Number(v) * 100).toFixed(0)}%`;
}
function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
