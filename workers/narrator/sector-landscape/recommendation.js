// Sector-landscape recommendation — GPT-5 call that produces the rotation
// stance + forward signposts that would flip the sector ranking.
//
// Contract: stance names sectors to ADD / CUT and why (edge vs. consensus is
// the INTERPRETATION layer at this surface). Signposts are dated events from
// the calendar, or factor thresholds with a numeric level.

import { callGPT5 } from "../shared/openai.js";
import { validateRecommendation } from "../shared/validate.js";

export async function runLandscapeRecommendation({ apiKey, input, identification }) {
  const prompt = buildPrompt(input, identification);
  const raw = await callGPT5({ apiKey, prompt, label: "sector-landscape-recommendation" });

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
    regime: input.regime,
    sectors: input.sectors,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    economic_calendar: input.calendar,
    previous_recommendation: input.previous.recommendation || null,
  };

  return [
    `You are a senior portfolio manager writing the sector-rotation stance for a professional investor's daily note.`,
    ``,
    `You are given the comparative sector identification above, the full sector factor panel, the regime context, and the economic calendar. Produce a rotation stance + dated signposts that would FLIP the sector ranking.`,
    ``,
    `OUTPUT STRUCTURE (single JSON object):`,
    ``,
    `  stance (string — ONE sentence): must contain:`,
    `    - which sectors to ADD (overweight or move up) and which to CUT (underweight or move down) — name each sector explicitly`,
    `    - the factor pillar driving each call (regime-fit, valuation, momentum, earnings breadth, etc.)`,
    `    - conviction [0–1]`,
    `    - edge vs. consensus: what is the tape or the sell-side already pricing vs. what you think. This is the INTERPRETATION layer.`,
    ``,
    `  signposts (array of 3–5): each MUST contain`,
    `    - trigger: the observable event (e.g. "Energy 13-wk rel-strength turns negative", "Healthcare regime-fit flips below 0")`,
    `    - threshold: the specific numeric level that matters`,
    `    - dated_event: ISO date OR a labeled upcoming release from the economic_calendar input (e.g. "2026-05-06 FOMC", "next CPI print")`,
    `    - action: what we DO (specific — not "reassess"). e.g. "Rotate Tech → Healthcare 200bp", "Trim Industrial OW to EW"`,
    ``,
    `Rules (HARD):`,
    `  1. Dated events must come from the economic_calendar input or be ISO dates in the future (> ${input.as_of}).`,
    `  2. Every numeric threshold must be a factor or indicator that appears in the DATA block.`,
    `  3. Stance MUST include an explicit edge-vs-consensus clause. Missing that = invalid.`,
    `  4. At least one ADD sector and one CUT sector named by name.`,
    `  5. No hedging prose. This is a trade sheet.`,
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
