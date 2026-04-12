// validation/lib/consensus-checker.js — Flags SIGNAL_03_Consensus disagreements
const WORKER_API = process.env.WORKER_API || "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

async function checkConsensus() {
  try {
    const res = await fetch(`${WORKER_API}/query/consensus`);
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}`, details: {} };

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: "No consensus data", details: { count: 0 } };
    }

    // Flag LOW confidence and any with missed factors
    const lowConfidence = rows.filter(r => r.confidence === "LOW");
    const withMissedFactors = rows.filter(r => Array.isArray(r.missed_factors) && r.missed_factors.length > 0);
    const disagreements = rows.filter(r => r.consensus_level < 0.4);

    // Valid if we have consensus data — warnings are informational, not failures
    const valid = rows.length > 0;

    return {
      valid,
      count: rows.length,
      details: {
        total: rows.length,
        low_confidence: lowConfidence.map(r => ({ target: r.target, level: r.consensus_level, counter: r.strongest_counter })),
        disagreements: disagreements.map(r => ({ target: r.target, level: r.consensus_level })),
        missed_factors_targets: withMissedFactors.map(r => ({ target: r.target, factors: r.missed_factors })),
      },
    };
  } catch (err) {
    return { valid: false, error: err.message, details: {} };
  }
}

function getSummary(result) {
  if (!result) return { passed: 0, total: 0, issues: [] };
  const issues = [];
  if (result.details?.low_confidence?.length) {
    for (const lc of result.details.low_confidence.slice(0, 5)) {
      issues.push(`${lc.target}: LOW consensus (${lc.level.toFixed(2)}) — ${lc.counter?.slice(0, 80) || "no counter"}`);
    }
  }
  if (result.details?.missed_factors_targets?.length) {
    for (const mf of result.details.missed_factors_targets.slice(0, 3)) {
      issues.push(`${mf.target}: missed factors — ${(mf.factors || []).slice(0, 2).join("; ")}`);
    }
  }
  return {
    passed: result.valid ? 1 : 0,
    total: 1,
    issues,
  };
}

export { checkConsensus, getSummary };
