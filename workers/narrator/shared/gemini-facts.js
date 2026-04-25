// Gemini fact-check agent.
//
// Takes a list of [{claim, date}] assertions and returns [{claim, verified,
// source_url}]. Narrow dated questions only — "did the March FOMC minutes
// drop 'patient' language?" yes/no. Refuses causal or open-ended questions.
//
// Decision #2 in NARRATIVE_BUILD_PLAN.md is "Gemini fact-check: ON", but this
// module ships with a clean interface + a stub implementation so the narrator
// pipelines can call it from day 1. Flip `env.GEMINI_API_KEY` presence to
// enable real calls.

export async function factCheck(env, claims) {
  if (!claims || !claims.length) return [];

  // Stub path: no key configured → pass-through (neither verified nor
  // rejected). Narrator treats `verified: null` as "unverified — include but
  // flag in audit", not as a rejection.
  if (!env.GEMINI_API_KEY) {
    return claims.map((c) => ({
      claim: c.claim,
      date: c.date,
      verified: null,
      source_url: null,
      note: "gemini-facts stub: no GEMINI_API_KEY configured",
    }));
  }

  // Real path (to be implemented). Keeping the interface here so callers can
  // start wiring now; flipping a key enables real verification without
  // code changes elsewhere.
  //
  // const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" + env.GEMINI_API_KEY;
  // ... per-claim call, parse response, return structured answers ...

  return claims.map((c) => ({
    claim: c.claim,
    date: c.date,
    verified: null,
    source_url: null,
    note: "gemini-facts live path not yet implemented",
  }));
}
