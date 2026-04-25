// Sector-landscape identification — GPT-5 call that produces COMPARATIVE
// bullets: what separates the top-ranked sectors from the bottom-ranked.
//
// Contract (shared with regime identification): every bullet carries
// { headline, number, event, interpretation, source }. For this surface the
// `event` is typically a sector-level news item, a regime-fit / factor
// threshold crossing, or a stance change. `interpretation` must tie factor
// values to a forward-looking implication (what it means), not a restatement.
//
// Anti-deep-dive rule: bullets must compare 2+ sectors or call out a
// cross-sector pattern. A bullet that names only one sector is dropped by
// the validator's comparative check below.

import { callGPT5 } from "../shared/openai.js";
import { validateIdentification } from "../shared/validate.js";

const SECTOR_NAME_RE = /\b(Technology|Communication|ConsDisc|Finance|Energy|Healthcare|Staples|Industrial|TechHardware|TechSoftware|TechDigitalConsumer)\b/g;

export async function runLandscapeIdentification({ apiKey, input }) {
  const prompt = buildPrompt(input);
  const raw = await callGPT5({ apiKey, prompt, label: "sector-landscape-identification" });

  const inputText = JSON.stringify(input);
  const validated = validateIdentification(raw, inputText);

  // Additional comparative check: bullet must reference 2+ sectors, OR be a
  // "top vs. bottom" pattern summary. A single-sector deep-dive is rejected.
  const bullets = [];
  const dropped = [...(validated.dropped || [])];
  for (const b of validated.bullets) {
    const text = `${b.headline} ${b.interpretation}`;
    const sectors = new Set((text.match(SECTOR_NAME_RE) || []));
    if (sectors.size < 2) {
      dropped.push({ bullet: b, reason: "not_comparative_single_sector_only" });
      continue;
    }
    bullets.push(b);
  }

  return {
    raw,
    bullets,
    dropped,
    missing_factors: validated.missing_factors,
    ok: bullets.length > 0,
  };
}

function buildPrompt(input) {
  const dataBlock = {
    as_of: input.as_of,
    sector_date: input.sector_date,
    regime: input.regime,
    sectors: input.sectors,
    news_by_sector: input.news,
    previous_identification: input.previous.identification || null,
  };

  return [
    `You are a senior cross-asset strategist writing the COMPARATIVE sector commentary for a professional investor's daily note.`,
    ``,
    `Your job is to identify what SEPARATES the sectors — what pattern distinguishes the top-ranked from the bottom-ranked. This is NOT a deep-dive of any single sector.`,
    ``,
    `Produce 3 to 5 bullets, ranked by impact. Each bullet MUST:`,
    `  - reference at least TWO sectors by name (comparative — single-sector bullets will be rejected),`,
    `  - carry all of: headline, number, event, interpretation, source,`,
    `  - tie a specific factor (regime_fit, valuation_sigma, rel_strength_13w, stance_score, earn_momentum, breadth_above_200dma, rs_ratio/rs_momentum) to a forward-looking meaning.`,
    ``,
    `Each bullet MUST contain ALL of:`,
    `  - headline: one sharp sentence naming the pattern (e.g. "Defensives bid as cyclicals fade")`,
    `  - number:   a specific numeric value drawn ONLY from the DATA below (can be a single factor value, a delta, or a spread)`,
    `  - event:    dated event anchor — a sector news headline from news_by_sector OR a factor threshold like "${input.sector_date} stance_score spread"`,
    `  - interpretation: the CRITICAL READ — what the factor value means in regime context. Not a paraphrase of the number. ≥20 chars.`,
    `  - source:   { table: "...", id: "..." } — e.g. { "table": "SECTOR_FACTORS_daily", "id": "Technology@${input.sector_date}" } or { "table": "BETA_12_News_digest", "id": "<ticker>@<date>" }`,
    ``,
    `Rules (HARD):`,
    `  1. Every number cited MUST appear verbatim in the DATA block. Do not invent.`,
    `  2. Bullets that name only one sector will be dropped. Compare.`,
    `  3. Do not repeat the regime identification — use the regime as context only.`,
    `  4. Also return \`missing_factors\`: a concrete list of signals that would change your read but are not in the input (e.g. "no flow data", "no breadth below 50dma").`,
    ``,
    `OUTPUT: a single JSON object matching this schema exactly — no prose outside JSON.`,
    `  {`,
    `    "bullets": [`,
    `      { "headline": "...", "number": "...", "event": "...", "interpretation": "...", "source": { "table": "...", "id": "..." } }`,
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
