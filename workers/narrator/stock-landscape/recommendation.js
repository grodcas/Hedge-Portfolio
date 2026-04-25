// Stock-landscape recommendation — GPT-5 call producing top 3 picks with
// conviction tier and signposts that would rotate the ranking.
//
// Contract:
//   stance: names top 3 picks, conviction tier per pick (H/M/L), why each
//           is preferred over peers in the SAME sector, and an edge-vs-consensus
//           clause.
//   signposts: 3–5 dated triggers that would flip the ranking.

import { callGPT5 } from "../shared/openai.js";
import { validateRecommendation } from "../shared/validate.js";

export async function runStockLandscapeRecommendation({ apiKey, input, identification }) {
  const prompt = buildPrompt(input, identification);
  const raw = await callGPT5({ apiKey, prompt, label: "stock-landscape-recommendation" });

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
    shortlist_date: input.shortlist_date,
    regime: input.regime,
    sector_landscape_top_bullet: input.sector_landscape_top_bullet,
    shortlist: input.shortlist,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    economic_calendar: input.calendar,
    previous_recommendation: input.previous?.recommendation || null,
  };

  return [
    `You are a senior portfolio manager writing the stock-picks ranking for a professional investor's daily note.`,
    ``,
    `Given the comparative identification and the full shortlist (with scores, probabilities, factors, sectors, news), produce the top 3 picks + dated signposts that would flip the ranking.`,
    ``,
    `OUTPUT STRUCTURE (single JSON object):`,
    ``,
    `  stance (string — ONE sentence): must contain`,
    `    - top 3 picks named explicitly (use tickers from input.shortlist)`,
    `    - conviction tier per pick: H / M / L`,
    `    - for each pick, WHY it is preferred over other shortlist peers in the SAME sector (cite a factor value)`,
    `    - overall conviction [0–1]`,
    `    - edge vs. consensus: what the tape/sell-side is already pricing vs. what you think. This is the INTERPRETATION layer.`,
    ``,
    `  signposts (array of 3–5): each MUST contain`,
    `    - trigger: the observable event (e.g. "UNH eps_rev_4w rolls negative", "LLY probability-of-favorable drops below 0.55")`,
    `    - threshold: the specific numeric level that matters`,
    `    - dated_event: ISO date OR a labeled upcoming release from the economic_calendar (e.g. "2026-04-28 LLY Q1", "2026-05-06 FOMC")`,
    `    - action: what we DO (specific — not "reassess"). e.g. "Drop LLY from top 3 and promote JNJ", "Add NVDA +100bp at the expense of INTC"`,
    ``,
    `Rules (HARD):`,
    `  1. Dated events must come from the economic_calendar input or be ISO dates in the future (> ${input.as_of}).`,
    `  2. Every numeric threshold must reference a factor/probability/score that appears in the DATA block.`,
    `  3. Stance MUST include an explicit edge-vs-consensus clause. Missing that = invalid.`,
    `  4. Top 3 picks must name tickers from the shortlist. Actions in signposts can reference any shortlist ticker.`,
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
