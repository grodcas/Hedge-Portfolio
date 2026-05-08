/**
 * Shared post-LLM validators for AI agents.
 *
 * Pattern: every agent's JSON-output contract should pin numeric claims to
 * source data, and the post-call validator should enforce sign-checks /
 * direction-consistency / cross-field consistency. Loose prose validation
 * is how UNH ended up with "compressed 380bps" while reality was "improved
 * 90bps" — the LLM's prose contradicted the numbers it shipped.
 *
 * Helpers below are imported by ticker-thesis, macro-news-drift, ticker-notes,
 * big-movers-why, ticker-valuation. Each helper THROWS on validation failure
 * so the caller wraps in try/catch and surfaces the error.
 */

// Compare two numbers with absolute tolerance. Used for "claimed value matches
// the input snapshot" checks where the LLM may round.
export function assertNumberCloseTo(claimed, expected, label, tolerance = 0.01) {
  const a = Number(claimed), b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(`${label}: not finite (claimed=${claimed}, expected=${expected})`);
  }
  // Tolerance is relative for large numbers, absolute for small.
  const diff = Math.abs(a - b);
  const tol  = Math.max(tolerance, Math.abs(b) * tolerance);
  if (diff > tol) {
    throw new Error(`${label}: claimed=${a} vs expected=${b} (diff=${diff.toFixed(4)} > tol=${tol.toFixed(4)})`);
  }
}

// Cross-field consistency: a "current" value above threshold should be claimed
// "above" / "exceeded" / "fired" in any accompanying text; below should be
// "below" / "under". Tolerance handles values right at the threshold.
export function assertDirectionMatchesText(value, threshold, text, label) {
  const v = Number(value), t = Number(threshold);
  if (!Number.isFinite(v) || !Number.isFinite(t)) return;       // can't check; pass
  const above = /\b(above|exceeded|over|breached|fired|crossed|higher than)\b/i.test(text);
  const below = /\b(below|under|short of|less than|lower than|trailing)\b/i.test(text);
  if (above && below) return;                                   // mixed — give the LLM benefit of doubt
  if (v > t * 1.001 && below) {
    throw new Error(`${label}: value ${v} > threshold ${t} but text says below — "${text.slice(0,120)}"`);
  }
  if (v < t * 0.999 && above) {
    throw new Error(`${label}: value ${v} < threshold ${t} but text says above — "${text.slice(0,120)}"`);
  }
}

// Move-direction sanity for big-movers-why and similar narrative agents.
// If the actual move sign disagrees with the prose direction-words, reject.
export function assertProseMatchesMoveSign(prose, movePct, label) {
  if (!Number.isFinite(movePct) || !prose) return;
  const up   = /\b(rose|gained|surged|jumped|climbed|advanced|rallied|popped|spiked)\b/i.test(prose);
  const down = /\b(fell|dropped|declined|sank|tumbled|slid|plunged|sliced|retreated)\b/i.test(prose);
  if (up && down)   return;                                     // mixed; pass
  if (movePct > 0 && down) {
    throw new Error(`${label}: move +${movePct.toFixed(2)}% but prose contains down-word`);
  }
  if (movePct < 0 && up) {
    throw new Error(`${label}: move ${movePct.toFixed(2)}% but prose contains up-word`);
  }
}

// vs_what cross-field check for valuation prose. Enum value must match any
// "vs X" pattern claimed in the prose, otherwise the LLM is internally
// inconsistent.
export function assertVsWhatConsistent(vsWhatEnum, prose, label) {
  if (!prose) return;
  const claimedSector = /\bvs\.?\s+(sector|peers?|industry|comparable\s+companies?)\b/i.test(prose);
  const claimedHistory = /\bvs\.?\s+(own\s+history|own\s+\d+y|self|its\s+\d+y|historical)\b/i.test(prose);
  const claimedMarket = /\bvs\.?\s+(market|s&p|spy|broader\s+market|index)\b/i.test(prose);
  if (vsWhatEnum === "own_history" && claimedSector && !claimedHistory) {
    throw new Error(`${label}: vs_what="own_history" but prose says "vs sector/peers"`);
  }
  if ((vsWhatEnum === "sector" || vsWhatEnum === "peers") && claimedHistory && !claimedSector) {
    throw new Error(`${label}: vs_what="${vsWhatEnum}" but prose says "vs own history"`);
  }
  if (vsWhatEnum === "market" && claimedSector && !claimedMarket) {
    throw new Error(`${label}: vs_what="market" but prose says "vs sector/peers"`);
  }
}

// Subset check: every cited ID in `claimed` must appear in `allowlist`.
// Used to enforce ticker-notes bullet provenance against TOPIC_FEED.
export function assertSubsetOf(claimed, allowlist, label) {
  const allowed = new Set(allowlist);
  const stray = [];
  for (const id of (claimed || [])) {
    if (id && !allowed.has(id)) stray.push(id);
  }
  if (stray.length > 0) {
    throw new Error(`${label}: ${stray.length} ids not in allowlist (sample: ${stray.slice(0,3).join(",")})`);
  }
}

// Verdict-mapping enforcement for macro-news-drift.
// Compute expected verdict from per-driver scores, reject mismatch.
export function expectedDriftVerdict(driverDrift) {
  if (!driverDrift || typeof driverDrift !== "object") return null;
  const scores = Object.values(driverDrift).filter(v => Number.isFinite(v));
  if (scores.length === 0) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean >= 1)   return "confirming";
  if (mean <= -1)  return "fading";
  return "mixed";
}

// "Unknown" verdict helper. Agents downstream of drift / thesis should
// short-circuit to verdict="unknown" when their input is null/empty rather
// than silently default to "intact" (which would surface a false-positive
// green light to the user).
export function isEffectivelyEmpty(blob) {
  if (blob == null) return true;
  if (typeof blob === "string") {
    if (blob.trim() === "" || blob === "{}" || blob === "null") return true;
    try {
      const parsed = JSON.parse(blob);
      return isEffectivelyEmpty(parsed);
    } catch { return false; }
  }
  if (typeof blob === "object") {
    if (Array.isArray(blob) && blob.length === 0) return true;
    if (Object.keys(blob).length === 0) return true;
  }
  return false;
}
