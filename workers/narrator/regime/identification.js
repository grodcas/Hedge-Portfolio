// Regime identification — GPT-5 call that produces the "what's driving the
// regime" bullets. Each bullet MUST carry: headline, number, event,
// interpretation, source. No exceptions. Post-call validation drops bullets
// that don't meet the contract (see shared/validate.js).
//
// Interpretation contract: the `interpretation` field is not a paraphrase
// of the number — it is the critical read of what the number means in
// context (base effects, trend, position in cycle, relation to Fed reaction
// function, etc.). Prompt makes this explicit; validator backstops it.

import { callGPT5 } from "../shared/openai.js";
import { validateIdentification } from "../shared/validate.js";

export async function runIdentification({ apiKey, input }) {
  const prompt = buildPrompt(input);
  const raw = await callGPT5({ apiKey, prompt, label: "regime-identification" });

  // Validate: drop bullets with hallucinated numbers, missing fields, or
  // interpretation too short / paraphrasing the number.
  const inputText = JSON.stringify(input);
  const validated = validateIdentification(raw, inputText);

  return {
    raw,
    bullets: validated.bullets,
    dropped: validated.dropped,
    missing_factors: validated.missing_factors,
    ok: validated.ok,
  };
}

function buildPrompt(input) {
  const dataBlock = {
    as_of: input.as_of,
    indicators: input.indicators.map((i) => ({
      label: i.label,
      code: i.code,
      value: i.value,
      prior: i.prior,
      unit: i.unit,
      direction_30d: i.direction_30d,
      release_date: i.release_date,
      period: i.period,
    })),
    macro_blob_trend: input.macro_blob?.trend ?? null,
    macro_blob_today: input.macro_blob?.today ?? null,
    fomc: input.fomc,
    whitehouse: input.whitehouse,
    news: input.news,
    previous_identification: input.previous.identification || null,
  };

  return [
    `You are a senior macro analyst writing for a professional investor.`,
    ``,
    `Your job is to identify the DRIVERS of the current regime — not summarize data, not list indicators. You must produce bullets that carry interpretation: what each number MEANS in context, not just what it is.`,
    ``,
    `Produce 3 to 5 bullets, ranked by impact. Each bullet MUST contain ALL of:`,
    `  - headline: one sharp sentence naming the driver`,
    `  - number:   a specific numeric value or dated event drawn ONLY from the data below`,
    `  - event:    the dated event this number ties to (e.g. "March FOMC minutes", "April CPI print", a Whitehouse announcement, a news headline). Cite the source item`,
    `  - interpretation: the CRITICAL READ — what the number actually means. Think base effects, Fed reaction function, cycle position, relation to prior regime. Do NOT paraphrase the number. Minimum 20 characters; aim for a full sentence. This field is load-bearing.`,
    `  - source:   { table: <string>, id: <string> } — the D1 table + row reference you drew the number from. e.g. { "table": "MACRO_STATE_indicators", "id": "CPI_CORE@2026-04-10" }`,
    ``,
    `Rules (HARD):`,
    `  1. Every number you cite MUST appear verbatim in the DATA block. Do not invent or paraphrase. If you cannot find a number in the DATA block, drop that bullet.`,
    `  2. Do NOT combine values to produce new numbers unless the derivation is explicit in the DATA block.`,
    `  3. Do NOT invent events, FOMC quotes, or news items. If you cannot anchor a bullet to a dated event in the DATA block, drop it.`,
    `  4. The INTERPRETATION field is MANDATORY. Bullets that only restate the number will be rejected.`,
    `  5. Also return \`missing_factors\`: a list of factors you believe matter for this regime but are NOT in the input. Be concrete (e.g. "Japan carry-unwind not in input", "no DXY value for today").`,
    ``,
    `OUTPUT: a single JSON object matching this schema exactly — no prose outside JSON.`,
    `  {`,
    `    "bullets": [`,
    `      {`,
    `        "headline": "...",`,
    `        "number": "...",`,
    `        "event": "...",`,
    `        "interpretation": "...",`,
    `        "source": { "table": "...", "id": "..." }`,
    `      }`,
    `    ],`,
    `    "missing_factors": ["..."]`,
    `  }`,
    ``,
    `DATA:`,
    "```json",
    JSON.stringify(dataBlock, null, 2),
    "```",
  ].join("\n");
}
