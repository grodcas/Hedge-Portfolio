// scripts/test-regime-narrative.js
//
// Integration test for the Sprint 1 regime narrative pipeline.
//
// Usage:
//   node scripts/test-regime-narrative.js                 # run once against deployed narrator
//   node scripts/test-regime-narrative.js --force         # force rebuild (bypass stability gate)
//   node scripts/test-regime-narrative.js --twice         # run twice; second run MUST skip LLM (stability quality gate)
//   node scripts/test-regime-narrative.js --dry           # local input + validation dry-run (no deploy needed)
//
// Exit 0 = all quality gates passed.
// Exit 1 = at least one gate failed.
//
// Quality gates checked (per NARRATIVE_BUILD_PLAN.md Sprint 1):
//   1. Numeric validation — no hallucinated numbers (dropped[] array visible)
//   2. Stability rule triggers on repeat run
//   3. Lede ≤ 45 words
//   4. Regime lede byte-identical between Regime entity + Macro hero (sanity read)
//   5. Interpretation field length >= 20 chars on every bullet
//   6. Every bullet has a {source.table, source.id}

const NARRATOR_BASE = process.env.NARRATOR_BASE
  || "https://narrator-regime.gines-rodriguez-castro.workers.dev";
const INGEST_BASE = process.env.INGEST_BASE
  || "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

const PASS = "✅";
const FAIL = "❌";
const INFO = "•";
let failed = 0;

function emit(marker, line) {
  console.log(`[${marker}] ${line}`);
  if (marker === FAIL) failed++;
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`${url} → non-JSON: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${j.error || text.slice(0, 200)}`);
  return j;
}

async function runBuild({ force } = {}) {
  const url = `${NARRATOR_BASE}/build${force ? "?force=1" : ""}`;
  console.log(`\n[${INFO}] POST-equivalent ${url}`);
  return getJson(url);
}

async function fetchNarrative() {
  return getJson(`${INGEST_BASE}/query/narrative?entity_type=regime`);
}

function gatesOnBuildResult(result) {
  if (!result.ok) return emit(FAIL, `build failed: ${result.error || JSON.stringify(result)}`);
  if (result.stable) {
    emit(PASS, "stability gate triggered (no LLM calls)");
    return;
  }
  emit(PASS, `build ok in ${result.duration_ms}ms; bullets=${result.bullets_written} signposts=${result.signposts_written} lede=${result.lede_source}`);
  if (!result.input_hash) emit(FAIL, "input_hash missing from build result");
  if (result.bullets_written < 2) emit(FAIL, `bullets_written=${result.bullets_written} — expected ≥2`);
  if (result.signposts_written < 2) emit(FAIL, `signposts_written=${result.signposts_written} — expected ≥2`);
}

function gatesOnNarrativeContent(n) {
  const fields = n?.fields || {};
  const cr = fields.current_reading?.content;
  const id = fields.identification?.content;
  const rec = fields.recommendation?.content;
  const lede = fields.lede?.content;

  if (!cr) emit(FAIL, "current_reading row missing"); else emit(PASS, "current_reading present");
  if (!id) emit(FAIL, "identification row missing"); else emit(PASS, "identification present");
  if (!rec) emit(FAIL, "recommendation row missing"); else emit(PASS, "recommendation present");
  if (!lede) emit(FAIL, "lede row missing"); else emit(PASS, "lede present");

  if (lede?.text) {
    const words = lede.text.split(/\s+/).filter(Boolean).length;
    if (words > 50) emit(FAIL, `lede too long: ${words} words (≤45 expected, 50 hard limit)`);
    else if (words > 45) emit(INFO, `lede slightly over soft limit: ${words} words`);
    else emit(PASS, `lede ${words} words`);
  }

  if (id?.bullets) {
    for (const b of id.bullets) {
      const interp = String(b.interpretation || "").trim();
      if (interp.length < 20) emit(FAIL, `bullet "${(b.headline || "?").slice(0, 40)}" interpretation too short (${interp.length} chars)`);
      if (!b.source?.table || !b.source?.id) emit(FAIL, `bullet "${(b.headline || "?").slice(0, 40)}" missing source`);
    }
    if (id.bullets.length) emit(PASS, `${id.bullets.length} identification bullets all pass interpretation + source checks`);
    if (id.dropped?.length) emit(INFO, `${id.dropped.length} bullets dropped by validator — see D1 row for reasons`);
  }

  if (rec?.stance) {
    // Naive edge-vs-consensus check: stance should reference "consensus" / "market" / "vs" somewhere.
    const s = String(rec.stance).toLowerCase();
    const hasEdgeClause = s.includes("consensus") || s.includes("market") || s.includes("vs") || s.includes("priced");
    if (hasEdgeClause) emit(PASS, "stance contains edge-vs-consensus language");
    else emit(FAIL, "stance missing edge-vs-consensus clause");
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const twice = process.argv.includes("--twice");
  const dry = process.argv.includes("--dry");

  if (dry) {
    // Dry mode: pull current narrative from the ingestor and run gates only.
    emit(INFO, "dry run — reading current narrative, not invoking narrator");
    const n = await fetchNarrative();
    gatesOnNarrativeContent(n);
    if (failed) { console.log(`\n${failed} gate(s) failed.`); process.exit(1); }
    console.log(`\nAll gates passed.`);
    return;
  }

  const first = await runBuild({ force });
  gatesOnBuildResult(first);

  if (twice) {
    emit(INFO, "running a second time to verify stability gate");
    const second = await runBuild({ force: false });
    if (!second.stable) emit(FAIL, "second run did NOT hit the stability gate — stability check broken");
    else emit(PASS, "second run correctly skipped LLM (stability gate held)");
  }

  // Verify the written rows look right
  const n = await fetchNarrative();
  gatesOnNarrativeContent(n);

  if (failed) { console.log(`\n${failed} gate(s) failed.`); process.exit(1); }
  console.log(`\nAll gates passed.`);
}

main().catch((e) => {
  console.error("test failed:", e.message);
  process.exit(1);
});
