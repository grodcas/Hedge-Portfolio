// Per-sector recommendation — GPT-5 call producing the tactical stance
// INSIDE this sector: which constituents to lean into, which to trim,
// position-sizing guidance, and signposts that would flip the call.
//
// Contract:
//   stance (string): names ADD tickers and CUT tickers inside this sector,
//                    the factor pillar driving each call, conviction [0–1],
//                    and an edge-vs-consensus clause.
//   signposts (3–5): trigger / threshold / dated_event / action.

import { callGPT5 } from "../shared/openai.js";
import { validateRecommendation } from "../shared/validate.js";

export async function runSectorRecommendation({ apiKey, input, identification }) {
  const prompt = buildPrompt(input, identification);
  const raw = await callGPT5({ apiKey, prompt, label: `sector-${input.sector}-recommendation` });

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
    sector_date: input.sector_date,
    sector: input.sector,
    factors: input.factors,
    peers: input.peers,
    constituents: input.constituents,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    economic_calendar: input.calendar,
    earnings_calendar: input.earnings,
    regime: input.regime,
    landscape_top_bullet: input.landscape?.top_bullet || null,
    previous_recommendation: input.previous?.recommendation || null,
  };

  return [
    `You are a senior portfolio manager writing the tactical stance for ${input.sector} in a professional investor's daily note.`,
    ``,
    `Given the identification bullets and the full factor panel for ${input.sector}, produce the intra-sector rotation stance — which constituents to ADD, which to CUT, and which dated triggers would flip the call.`,
    ``,
    `OUTPUT STRUCTURE (single JSON object):`,
    ``,
    `  stance (string — ONE sentence): must contain`,
    `    - which tickers to ADD and which to CUT inside ${input.sector} — name each explicitly (use only tickers from constituents)`,
    `    - the factor pillar driving each call (earnings momentum, relative strength, valuation, catalyst, revisions, etc.)`,
    `    - conviction [0–1]`,
    `    - edge vs. consensus: what is the tape or the sell-side already pricing in vs. what you think. This is the INTERPRETATION layer.`,
    ``,
    `  signposts (array of 3–5): each MUST contain`,
    `    - trigger: the observable event (e.g. "UNH Q1 earnings beat > +5%", "Healthcare regime_fit rolls below +0.5")`,
    `    - threshold: the specific numeric level that matters`,
    `    - dated_event: ISO date OR a labeled upcoming release from the earnings_calendar or economic_calendar (e.g. "2026-04-28 LLY Q1", "2026-05-06 FOMC")`,
    `    - action: what we DO (specific — not "reassess"). e.g. "Add LLY +100bp", "Trim NVDA 200bp", "Re-weight from MSFT to NVDA"`,
    ``,
    `Rules (HARD):`,
    `  1. Dated events must come from the earnings_calendar or economic_calendar in the DATA block, or be ISO dates in the future (> ${input.as_of}).`,
    `  2. Every numeric threshold must reference a factor or indicator that appears in the DATA block.`,
    `  3. Stance MUST include an explicit edge-vs-consensus clause. Missing that = invalid.`,
    `  4. At least one ADD ticker AND one CUT ticker named. Use ONLY tickers from input.constituents.`,
    `  5. Do not reference tickers outside ${input.sector}.`,
    `  6. No hedging prose. This is a trade sheet.`,
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
