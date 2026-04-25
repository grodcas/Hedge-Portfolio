// Per-stock identification — GPT-5 call producing bullets diagnosing THIS
// ticker. Supports two horizons via the `horizon` parameter:
//   - "long"  — fundamentals + 4-quarter earnings + analyst trajectory + 10-K/10-Q
//               summaries. What durable factors drive the long-term view.
//   - "short" — momentum, relative strength, 7d news, recent press, days to
//               catalyst, probability shift. What's moving the tactical read.
//
// Shared validator (validateIdentification) enforces numeric-grounding and
// the bullet shape. An additional "same ticker" guard drops bullets that
// reference a ticker other than `ticker` (catches cross-stock contamination).

import { callGPT5 } from "../shared/openai.js";
import { validateIdentification } from "../shared/validate.js";

// Universe of tickers we MIGHT see cross-referenced (same set as SECTOR_BUCKET).
const UNIVERSE = new Set([
  "AAPL","MSFT","NVDA","INTC","AMD",
  "AMZN","TSLA","HD",
  "GOOGL","META","NFLX",
  "JPM","GS","BAC","MS","BRK.B",
  "XOM","CVX",
  "UNH","LLY","JNJ",
  "PG","KO",
  "CAT","BA",
]);

function buildTickerRe() {
  // Longest first so "BRK.B" wins over "BRK".
  const alts = [...UNIVERSE].sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/\./g, "\\."));
  return new RegExp(`\\b(${alts.join("|")})\\b`, "g");
}

export async function runStockIdentification({ apiKey, input, horizon }) {
  const prompt = buildPrompt(input, horizon);
  const raw = await callGPT5({ apiKey, prompt, label: `stock-${input.ticker}-ident-${horizon}` });

  const inputText = JSON.stringify(input);
  const validated = validateIdentification(raw, inputText);

  // Cross-stock contamination guard: any bullet referencing a ticker other
  // than input.ticker is dropped.
  const re = buildTickerRe();
  const bullets = [];
  const dropped = [...(validated.dropped || [])];
  for (const b of validated.bullets) {
    const text = `${b.headline} ${b.number} ${b.event} ${b.interpretation}`;
    const matches = new Set();
    for (const m of text.matchAll(re)) matches.add(m[0]);
    matches.delete(input.ticker);
    if (matches.size > 0) {
      dropped.push({ bullet: b, reason: `foreign_ticker:${[...matches].join(",")}` });
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

function buildPrompt(input, horizon) {
  const ticker = input.ticker;
  const sector = input.sector || "n/a";
  const isLong = horizon === "long";

  // Subset the data block per horizon to keep prompts tight.
  const dataBlock = isLong ? {
    as_of: input.as_of,
    ticker,
    sector,
    assessment: input.assessment,                        // full factor panel + explanation
    fundamentals: input.fundamentals,
    stock_factors: input.stock_factors,
    earnings: input.earnings,                            // 4 quarters
    analyst_trajectory: input.analyst,                   // 90d
    reports: input.reports,                              // 10-K / 10-Q / 8-K summaries (30d)
    sector_top_bullet: input.sector_top_bullet,
    trend_long: input.trend_long,
    previous_identification: input.previous?.ident_long || null,
  } : {
    as_of: input.as_of,
    ticker,
    sector,
    assessment_score: input.assessment?.score,
    stock_factors: input.stock_factors,                  // mom_12_1, rs_vs_sector_3m, days_to_catalyst
    probability_latest: input.probability?.latest,
    probability_curve_7d: (input.probability?.curve_30d || []).slice(-7),
    news_7d: input.news,
    press_14d: input.press,
    trend_short: input.trend_short,
    sector_top_bullet: input.sector_top_bullet,
    previous_identification: input.previous?.ident_short || null,
  };

  const horizonLabel = isLong ? "LONG-TERM (6–18 months)" : "TACTICAL (1–2 weeks)";
  const horizonFocus = isLong
    ? `Focus on fundamentals, earnings trajectory, analyst revisions, and filings narrative. What durable factors support or challenge the long-term thesis?`
    : `Focus on momentum, relative strength, recent news/press, probability shifts, and the days-to-catalyst setup. What's changing the tactical read right now?`;

  return [
    `You are a senior equity analyst writing the ${horizonLabel} identification block for ${ticker} in a professional investor's daily note.`,
    ``,
    horizonFocus,
    ``,
    `Produce 3 to 5 bullets, ranked by impact. Each bullet MUST:`,
    `  - stay inside ${ticker} (do NOT reference other tickers),`,
    `  - carry all of: headline, number, event, interpretation, source,`,
    `  - tie a specific factor / fundamental / news item to a forward-looking meaning.`,
    ``,
    `Each bullet MUST contain ALL of:`,
    `  - headline: one sharp sentence (e.g. "Revisions breadth widens into catalyst")`,
    `  - number:   a specific numeric value drawn ONLY from the DATA below`,
    `  - event:    dated anchor — a news/press/filing item date from the DATA, OR a factor reading like "${input.as_of} fwd_pe"`,
    `  - interpretation: the CRITICAL READ — what this means for ${ticker}'s ${isLong ? "long-term trajectory" : "1-2 week tape"}. Not a restatement of the number. ≥20 chars.`,
    `  - source:   { table: "...", id: "..." } — e.g. { "table": "SIGNAL_01_Assessment", "id": "${ticker}@${input.assessment?.date || input.as_of}" }, { "table": "FUND_02_Earnings", "id": "${ticker}@<report_date>" }, { "table": "ALPHA_01_Reports", "id": "${ticker}@<date>" }, { "table": "BETA_12_News_digest", "id": "${ticker}@<date>" }, { "table": "STOCK_FACTORS_daily", "id": "${ticker}@${input.as_of}" }`,
    ``,
    `Rules (HARD):`,
    `  1. Every number cited MUST appear verbatim in the DATA block. No invented numbers.`,
    `  2. Only cite ${ticker}. Do NOT reference other tickers (e.g. peers, sector ETFs).`,
    `  3. Do not repeat the sector narrative — use sector_top_bullet as context only.`,
    `  4. Also return \`missing_factors\`: concrete signals that would change your read but are absent (e.g. "no insider 13F data", "no Q1 guidance beyond EPS estimate").`,
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
