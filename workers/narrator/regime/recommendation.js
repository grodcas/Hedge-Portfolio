// Regime recommendation — GPT-5 call that produces the positioning stance
// + forward signposts. Stance carries explicit edge-vs-consensus (that is
// where the interpretation lives at this layer). Signposts are dated events
// from the input calendar, with specific triggers and actions.

import { callGPT5 } from "../shared/openai.js";
import { validateRecommendation } from "../shared/validate.js";

export async function runRecommendation({ apiKey, input, identification }) {
  const prompt = buildPrompt(input, identification);
  const raw = await callGPT5({ apiKey, prompt, label: "regime-recommendation" });

  const inputText = JSON.stringify({ input, identification });
  const validated = validateRecommendation(raw, inputText);

  return {
    raw,
    stance: validated.stance,
    signposts: validated.signposts,
    dropped: validated.dropped,
    ok: validated.ok,
  };
}

function buildPrompt(input, identification) {
  const dataBlock = {
    as_of: input.as_of,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    macro_blob_recommendation: input.macro_blob?.recommendation ?? null,
    macro_blob_scenarios: input.macro_blob?.scenarios ?? null,
    macro_blob_catalysts: input.macro_blob?.catalysts ?? null,
    economic_calendar: input.calendar,
    previous_recommendation: input.previous.recommendation || null,
  };

  return [
    `You are a senior portfolio manager. Given the regime identification below + the economic calendar + the current book's implicit positioning, produce a crisp stance and a handful of forward-looking signposts.`,
    ``,
    `OUTPUT STRUCTURE (single JSON object):`,
    ``,
    `  stance (string — ONE sentence): must contain:`,
    `    - net exposure (%, or "long"/"neutral"/"short")`,
    `    - key tilts (sectors, factors, duration)`,
    `    - conviction score [0–1]`,
    `    - edge vs. consensus: what the market is pricing vs. what we think — this is the INTERPRETATION layer. If you cannot articulate an edge, there is no recommendation — say so.`,
    ``,
    `  signposts (array of 3–5): each MUST contain`,
    `    - trigger: the observable event`,
    `    - threshold: the specific level or condition that matters (numeric when possible)`,
    `    - dated_event: an ISO date OR a labeled upcoming release from the economic_calendar input ("next CPI print", "May 2 FOMC")`,
    `    - action: what we DO if triggered (specific — not "reassess")`,
    ``,
    `Rules (HARD):`,
    `  1. Dated events must come from the economic_calendar input or be ISO dates in the future (> ${input.as_of}).`,
    `  2. Do NOT invent numbers or events. Every threshold must be achievable and observable.`,
    `  3. The stance MUST include an explicit edge-vs-consensus clause. Missing that = invalid stance.`,
    `  4. No hedging prose. This is a trade sheet, not a research note.`,
    ``,
    `OUTPUT JSON SCHEMA:`,
    `{`,
    `  "stance": "...",`,
    `  "signposts": [`,
    `    { "trigger": "...", "threshold": "...", "dated_event": "...", "action": "..." }`,
    `  ]`,
    `}`,
    ``,
    `DATA:`,
    "```json",
    JSON.stringify(dataBlock, null, 2),
    "```",
  ].join("\n");
}
