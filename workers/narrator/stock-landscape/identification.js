// Stock-landscape identification — GPT-5 call that produces COMPARATIVE
// bullets across the shortlist. What separates the top-ranked from the rest?
// Which stocks are new, which dropped off? 3–5 bullets.
//
// Anti-deep-dive guard: each bullet must name 2+ tickers from the shortlist,
// or explicitly call out a cross-stock pattern. A bullet naming only one
// ticker is dropped.

import { callGPT5 } from "../shared/openai.js";
import { validateIdentification } from "../shared/validate.js";

export async function runStockLandscapeIdentification({ apiKey, input }) {
  const prompt = buildPrompt(input);
  const raw = await callGPT5({ apiKey, prompt, label: "stock-landscape-identification" });

  const inputText = JSON.stringify(input);
  const validated = validateIdentification(raw, inputText);

  // Comparative check: each bullet must mention ≥2 distinct shortlist tickers.
  const shortlistTickers = new Set((input.shortlist || []).map((s) => s.ticker));
  const tickerRe = buildTickerRegex(shortlistTickers);
  const bullets = [];
  const dropped = [...(validated.dropped || [])];
  for (const b of validated.bullets) {
    const text = `${b.headline} ${b.event} ${b.interpretation}`;
    const found = new Set();
    if (tickerRe) {
      for (const m of text.matchAll(tickerRe)) found.add(m[0]);
    }
    if (found.size < 2) {
      dropped.push({ bullet: b, reason: "not_comparative_single_ticker_only" });
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

function buildTickerRegex(tickerSet) {
  if (!tickerSet.size) return null;
  // Longest first so "BRK.B" is preferred over "BRK".
  const alts = [...tickerSet].sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/\./g, "\\."));
  return new RegExp(`\\b(${alts.join("|")})\\b`, "g");
}

function buildPrompt(input) {
  const dataBlock = {
    as_of: input.as_of,
    shortlist_date: input.shortlist_date,
    regime: input.regime,
    sector_landscape_top_bullet: input.sector_landscape_top_bullet,
    shortlist: input.shortlist,
    news: input.news,
    previous_identification: input.previous?.identification || null,
  };

  return [
    `You are a senior equity strategist writing the COMPARATIVE stock commentary for a professional investor's daily note.`,
    ``,
    `Your job: identify what SEPARATES the top-ranked stocks from the bottom of the shortlist. Which names are new to the list? Which have dropped? What factor pattern distinguishes the leaders? This is NOT a deep-dive of any single ticker.`,
    ``,
    `Produce 3 to 5 bullets, ranked by impact. Each bullet MUST:`,
    `  - reference at least TWO tickers from the shortlist by name (comparative — single-ticker bullets will be rejected),`,
    `  - carry all of: headline, number, event, interpretation, source,`,
    `  - tie a specific factor (composite score, probability.p_favorable, eps_rev_4w, rel_pe_sigma, rs_vs_sector_3m, sue, mom_12_1, days_to_catalyst) or named news item to a forward-looking meaning.`,
    ``,
    `Each bullet MUST contain ALL of:`,
    `  - headline: one sharp sentence naming the pattern (e.g. "Revisions breadth separates the leaders")`,
    `  - number:   a specific numeric value drawn ONLY from the DATA below (can be a single stock's factor, a delta, a spread, or a probability)`,
    `  - event:    dated anchor — a news item from news[<ticker>] OR a factor reading like "${input.shortlist_date} composite score"`,
    `  - interpretation: the CRITICAL READ — what the pattern means for ranking dynamics. Not a restatement of the number. ≥20 chars.`,
    `  - source:   { table: "...", id: "..." } — e.g. { "table": "SIGNAL_01_Assessment", "id": "${input.shortlist[0]?.ticker || 'AAPL'}@${input.shortlist_date}" } or { "table": "BETA_12_News_digest", "id": "<ticker>@<date>" } or { "table": "STOCK_FACTORS_daily", "id": "<ticker>@<date>" }`,
    ``,
    `Rules (HARD):`,
    `  1. Every number cited MUST appear verbatim in the DATA block. Do not invent.`,
    `  2. Bullets that name only one ticker will be dropped. Compare.`,
    `  3. Do not repeat the regime or sector-landscape identification — those are context only. Focus on STOCK-level pattern.`,
    `  4. Also return \`missing_factors\`: concrete signals that would change your read but are absent (e.g. "no insider data", "no sell-side target deltas").`,
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
