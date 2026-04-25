// scripts/validate-live.js
//
// Live validation of macro + portfolio/sector numerical data freshness and
// completeness. Emits pass/fail per check; exits nonzero on hard failures.
// "Expected pending" items (e.g. Piotroski waiting on AV daily cap) do not
// fail the script — they print with a ⏳ marker.
//
// Usage: node scripts/validate-live.js
// Exit 0 = all critical checks passed.
// Exit 1 = at least one critical check failed.

const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

const PASS = "✅";
const FAIL = "❌";
const PEND = "⏳";

let failed = 0;
function emit(marker, line) {
  console.log(`[${marker}] ${line}`);
  if (marker === FAIL) failed++;
}

async function getJson(path) {
  const res = await fetch(`${INGEST_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function ageInDays(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

async function checkMacro() {
  const row = await getJson("/query/daily-macro");
  if (!row?.summary) return emit(FAIL, "macro: no summary blob");
  let s;
  try { s = typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary; }
  catch { return emit(FAIL, "macro: summary unparseable"); }
  if (!s.trend?.regime) return emit(FAIL, "macro: trend.regime missing");
  const conf = s.confidence ?? s.trend?.confidence;
  if (typeof conf !== "number") return emit(FAIL, "macro: confidence missing (Sprint 8)");
  emit(PASS, `macro regime=${s.trend.regime} confidence=${conf.toFixed(2)} (${row.creation_date?.slice(0,10)})`);
}

async function checkSectorFactors() {
  const rows = await getJson("/query/sector-factors");
  if (!Array.isArray(rows) || rows.length !== 8) {
    return emit(FAIL, `sector-factors: ${rows?.length ?? 0} rows (expected 8)`);
  }
  const required = ["regime_fit", "earn_momentum", "rel_strength_13w", "rs_ratio",
                    "rs_momentum", "breadth_above_200dma", "stance", "valuation_sigma"];
  const missing = [];
  for (const r of rows) {
    for (const f of required) {
      if (r[f] == null) missing.push(`${r.sector}.${f}`);
    }
  }
  if (missing.length > 0) {
    return emit(FAIL, `sector-factors: ${missing.length} null critical fields — ${missing.slice(0,5).join(", ")}`);
  }
  // freshness
  const oldest = Math.max(...rows.map(r => ageInDays(r.created_at)));
  if (oldest > 2) return emit(FAIL, `sector-factors: stale (${oldest.toFixed(1)}d old)`);
  const xsectCount = rows.filter(r => r.valuation_sigma_method === "xsect").length;
  const rollingCount = rows.filter(r => r.valuation_sigma_method === "rolling").length;
  emit(PASS, `sector-factors: 8/8 complete, freshness ${oldest.toFixed(1)}d, valuation_sigma ${rollingCount}rolling/${xsectCount}xsect`);
}

async function checkStockFactors() {
  const rows = await getJson("/query/stock-factors");
  if (!Array.isArray(rows) || rows.length !== 25) {
    return emit(FAIL, `stock-factors: ${rows?.length ?? 0} rows (expected 25)`);
  }
  const critical = ["fwd_pe", "sue", "eps_rev_4w", "rev_breadth_4w"];
  for (const f of critical) {
    const nn = rows.filter(r => r[f] != null).length;
    if (nn < 24) return emit(FAIL, `stock-factors.${f}: ${nn}/25 (need >=24)`);
  }
  const piotroski = rows.filter(r => r.piotroski_f != null).length;
  emit(PASS, `stock-factors: fwd_pe/sue/eps_rev/rev_breadth all >=24/25`);
  if (piotroski < 20) {
    emit(PEND, `stock-factors.piotroski_f: ${piotroski}/25 (awaits AV IS/BS/CF daily passes)`);
  } else {
    emit(PASS, `stock-factors.piotroski_f: ${piotroski}/25`);
  }
  const momCount = rows.filter(r => r.mom_12_1 != null).length;
  const rs3mCount = rows.filter(r => r.rs_vs_sector_3m != null).length;
  if (momCount < 24) emit(FAIL, `stock-factors.mom_12_1: ${momCount}/25`);
  if (rs3mCount < 24) emit(FAIL, `stock-factors.rs_vs_sector_3m: ${rs3mCount}/25`);
}

async function checkNav() {
  const rows = await getJson("/query/nav");
  if (!Array.isArray(rows) || rows.length === 0) {
    return emit(FAIL, "nav: no rows");
  }
  const latest = rows[rows.length - 1];
  if (!latest.positions_count || latest.positions_count <= 0) {
    return emit(FAIL, `nav: positions_count=${latest.positions_count}`);
  }
  if (!latest.net_value || latest.net_value <= 0) {
    return emit(FAIL, `nav: net_value=${latest.net_value}`);
  }
  emit(PASS, `nav ${latest.date}: net_value=$${(latest.net_value/1e6).toFixed(2)}M positions=${latest.positions_count}`);
}

async function checkPositions() {
  const rows = await getJson("/query/positions");
  if (!Array.isArray(rows) || rows.length === 0) {
    return emit(FAIL, "positions: no rows");
  }
  const fullyPriced = rows.filter(r => r.market_value != null).length;
  if (fullyPriced < rows.length) {
    return emit(FAIL, `positions: ${fullyPriced}/${rows.length} have market_value`);
  }
  emit(PASS, `positions: ${rows.length} rows, all priced`);
}

async function checkSectorValuation() {
  const rows = await getJson("/query/sector-valuation");
  if (!Array.isArray(rows) || rows.length < 8) {
    return emit(FAIL, `sector-valuation: ${rows?.length ?? 0} rows (need >=8)`);
  }
  emit(PASS, `sector-valuation: ${rows.length} rows (${new Set(rows.map(r => r.etf_ticker)).size} ETFs)`);
}

async function main() {
  console.log(`[validate-live] Hedge-Portfolio numerical data health check — ${new Date().toISOString()}`);
  console.log();

  for (const [name, fn] of [
    ["macro", checkMacro],
    ["sector-factors", checkSectorFactors],
    ["stock-factors", checkStockFactors],
    ["nav", checkNav],
    ["positions", checkPositions],
    ["sector-valuation", checkSectorValuation],
  ]) {
    try { await fn(); }
    catch (err) { emit(FAIL, `${name}: ${err.message}`); }
  }

  console.log();
  if (failed > 0) {
    console.log(`[validate-live] ${failed} critical check(s) FAILED.`);
    process.exit(1);
  }
  console.log(`[validate-live] ALL CRITICAL CHECKS PASS. (⏳ items awaiting data are expected.)`);
  process.exit(0);
}

main().catch(err => {
  console.error(`[validate-live] FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
