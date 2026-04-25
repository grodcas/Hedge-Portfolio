// Deterministic "current reading" composer.
//
// Purpose: produce a 3-line factual paragraph describing the current macro
// state. No LLM. Just template fill from the gathered input. This is the
// first of the 3 narrative blocks — identification and recommendation build
// on top of what the reader sees here.
//
// Example output:
//   GDP nowcast +1.4% (decelerating 30d). Core CPI 3.2% (YoY, sticky).
//   Fed Funds 4.875%; 10Y 4.32% (falling 15bp); 2s10s +4bp.
//   HY spreads 318bp; VIX 16.4.

export function composeCurrentReading(input) {
  const byLabel = {};
  for (const i of input.indicators || []) byLabel[i.label] = i;

  const lines = [];
  const pushLine = (parts, sep) => {
    const kept = parts.filter(Boolean);
    if (kept.length) lines.push(kept.join(sep) + ".");
  };

  // Line 1: growth + inflation
  pushLine([
    _fmtIndicator(byLabel["GDP Nowcast"], { withDir: true, unit: "%" }),
    _fmtIndicator(byLabel["Core CPI YoY"], { withDir: true, unit: "%", prefix: "Core CPI YoY" }),
    _fmtIndicator(byLabel["Headline CPI YoY"], { withDir: true, unit: "%", prefix: "Headline CPI YoY" }),
  ], ". ");

  // Line 2: rates + curve
  pushLine([
    _fmtIndicator(byLabel["Fed Funds"], { unit: "%", prefix: "Fed Funds" }),
    _fmtIndicator(byLabel["10Y Yield"], { unit: "%", prefix: "10Y", withDir: true }),
    _fmtIndicator(byLabel["2Y Yield"], { unit: "%", prefix: "2Y" }),
    _fmtIndicator(byLabel["Curve (2s10s)"], { unit: "bp", prefix: "2s10s" }),
  ], "; ");

  // Line 3: labor + vol + regime label
  const parts3 = [];
  const unemp = _fmtIndicator(byLabel["Unemployment"], { unit: "%", prefix: "Unemployment" });
  const nfp = _fmtIndicator(byLabel["NFP (m/m change)"], { unit: "k", prefix: "NFP m/m" });
  if (unemp) parts3.push(unemp);
  if (nfp) parts3.push(nfp);
  const regime = input.numeric_snapshot?.regime_label;
  if (regime) parts3.push(`Regime: ${regime}`);
  pushLine(parts3, "; ");

  return {
    text: lines.join(" "),
    lines,
  };
}

function _fmtIndicator(ind, { withDir, unit, prefix } = {}) {
  if (!ind || ind.value == null) return null;
  const label = prefix || ind.label;
  const u = unit || ind.unit || "";
  const v = typeof ind.value === "number" ? _round(ind.value) : ind.value;
  const dir = withDir && ind.direction_30d && ind.direction_30d !== "flat"
    ? ` (${ind.direction_30d} 30d)`
    : "";
  return `${label} ${v}${u}${dir}`;
}

function _round(n) {
  if (Math.abs(n) >= 100) return Math.round(n);
  if (Math.abs(n) >= 10)  return +n.toFixed(1);
  return +n.toFixed(2);
}
