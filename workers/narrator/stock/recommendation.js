// Per-stock recommendation — GPT-5 call producing the tactical/long-term
// stance for a single ticker. Horizon "long" = position rationale +
// conviction + what breaks the long thesis. Horizon "short" = entry/trim
// trigger + 1-2wk stance + what flips the tactical read.
//
// Shape parallels sector/landscape recommendations:
//   stance (one sentence) — must include conviction [0–1] and edge-vs-consensus
//   signposts (3–5) — trigger / threshold / dated_event / action

import { callGPT5 } from "../shared/openai.js";
import { validateRecommendation } from "../shared/validate.js";

export async function runStockRecommendation({ apiKey, input, identification, horizon }) {
  const prompt = buildPrompt(input, identification, horizon);
  const raw = await callGPT5({ apiKey, prompt, label: `stock-${input.ticker}-rec-${horizon}` });

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

function buildPrompt(input, identification, horizon) {
  const ticker = input.ticker;
  const sector = input.sector || "n/a";
  const isLong = horizon === "long";

  const dataBlock = isLong ? {
    as_of: input.as_of,
    ticker, sector,
    assessment: input.assessment,
    fundamentals: input.fundamentals,
    stock_factors: input.stock_factors,
    earnings: input.earnings,
    analyst_trajectory: input.analyst,
    reports: input.reports,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    trend_long: input.trend_long,
    sector_top_bullet: input.sector_top_bullet,
    previous_recommendation: input.previous?.rec_long || null,
  } : {
    as_of: input.as_of,
    ticker, sector,
    stock_factors: input.stock_factors,
    probability_latest: input.probability?.latest,
    probability_curve_7d: (input.probability?.curve_30d || []).slice(-7),
    news_7d: input.news,
    press_14d: input.press,
    identification: {
      bullets: identification.bullets,
      missing_factors: identification.missing_factors,
    },
    trend_short: input.trend_short,
    sector_top_bullet: input.sector_top_bullet,
    previous_recommendation: input.previous?.rec_short || null,
  };

  const horizonLabel = isLong ? "LONG-TERM (6–18 months)" : "TACTICAL (1–2 weeks)";
  const stanceGuide = isLong
    ? `Position rationale (OW / EW / UW against sector), size conviction [0–1], and what specifically would break the long-term thesis (the disqualifying condition).`
    : `Entry or trim trigger for the next 1–2 weeks (buy/hold/trim/short), size conviction [0–1], and what specific shift flips the tactical read.`;
  const signpostGuide = isLong
    ? `Signposts are long-horizon fundamental events: next earnings, analyst revisions crossing thresholds, revised guidance, 10-K/10-Q items, sector regime shifts.`
    : `Signposts are tactical: next dated catalyst from stock_factors.days_to_catalyst, news-flow triggers (magnitude thresholds), probability-curve crossings, short-term momentum breakdowns.`;

  return [
    `You are a senior portfolio manager writing the ${horizonLabel} recommendation for ${ticker}.`,
    ``,
    `${stanceGuide}`,
    ``,
    `OUTPUT STRUCTURE (single JSON object):`,
    ``,
    `  stance (string — ONE sentence): must contain`,
    `    - ${isLong ? "position (OW / EW / UW vs sector)" : "tactical action (ADD / HOLD / TRIM / SHORT)"}`,
    `    - the factor pillar driving the call (cite a specific number from DATA)`,
    `    - conviction [0–1]`,
    `    - edge vs. consensus: what the tape/sell-side is already pricing vs. what you think. This is the INTERPRETATION layer.`,
    ``,
    `  signposts (array of 3–5): each MUST contain`,
    `    - trigger: the observable event (short, e.g. "${ticker} eps_rev_4w rolls negative")`,
    `    - threshold: the specific numeric level that matters`,
    `    - dated_event: ISO date OR a dated upcoming release referenced in the DATA (next earnings report_date, or an economic release if mentioned)`,
    `    - action: what we DO (specific — not "reassess"). e.g. "Trim ${ticker} 100bp", "Hold at target weight", "Add ${ticker} +150bp on confirmation"`,
    ``,
    `${signpostGuide}`,
    ``,
    `Rules (HARD):`,
    `  1. Dated events must be ISO dates in the future (> ${input.as_of}) OR a report_date in the DATA block.`,
    `  2. Every numeric threshold must reference a factor/metric that appears in the DATA block.`,
    `  3. Stance MUST include an explicit edge-vs-consensus clause. Missing that = invalid.`,
    `  4. Only reference ${ticker}. Do not invoke other tickers.`,
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
