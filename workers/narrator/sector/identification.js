// Per-sector identification — GPT-5 call producing bullets that diagnose
// THIS sector (factors + constituents + news). Unlike the landscape call,
// bullets here SHOULD name the sector and its tickers; they should NOT
// pretend to be comparative.
//
// Contract: every bullet carries { headline, number, event, interpretation,
// source }. Numbers must appear verbatim in the DATA block.
//
// Scope guard: bullets that cite a ticker NOT in input.constituents are
// dropped (reason: "ticker_not_in_sector"). This prevents cross-sector
// contamination — per Sprint 3 quality gate "No sector narrative mentions
// another sector's tickers".

import { callGPT5 } from "../shared/openai.js";
import { validateIdentification } from "../shared/validate.js";

// Simple ticker pattern: uppercase letters (2-5) optionally with a dot.
const TICKER_RE = /\b([A-Z]{1,5}(?:\.[A-Z])?)\b/g;
// Tokens that match TICKER_RE but are never tickers in our universe.
const TICKER_STOPWORDS = new Set([
  "A","I","OW","EW","UW","OR","AND","THE","FOR","WITH","VS","YOY","QOQ",
  "GDP","CPI","PPI","FED","FOMC","USD","EUR","GBP","JPY","CNY",
  "US","EU","UK","CEO","CFO","COO","CTO","IPO","M&A","P/E","PE","EPS",
  "ROE","ROI","ROA","YTD","MTD","DTD","VS.","AI","IT",
]);

export async function runSectorIdentification({ apiKey, input }) {
  const prompt = buildPrompt(input);
  const raw = await callGPT5({ apiKey, prompt, label: `sector-${input.sector}-identification` });

  const inputText = JSON.stringify(input);
  const validated = validateIdentification(raw, inputText);

  // Drop bullets that reference a ticker outside this sector.
  const allowedTickers = new Set((input.constituents || []).map((c) => c.ticker));
  const bullets = [];
  const dropped = [...(validated.dropped || [])];
  for (const b of validated.bullets) {
    const text = `${b.headline} ${b.number} ${b.event} ${b.interpretation}`;
    const foreignTicker = findForeignTicker(text, allowedTickers);
    if (foreignTicker) {
      dropped.push({ bullet: b, reason: `ticker_not_in_sector:${foreignTicker}` });
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

function findForeignTicker(text, allowed) {
  const matches = text.match(TICKER_RE) || [];
  for (const m of matches) {
    if (TICKER_STOPWORDS.has(m)) continue;
    if (m.length < 2) continue;
    // Skip obvious non-tickers: all single letters, numeric-looking, etc.
    if (!/^[A-Z]/.test(m)) continue;
    // We only flag tokens that look like a real S&P ticker: 3-5 caps or 1-letter
    // form like "T" is ambiguous — skip 1-letter tokens.
    if (m.length === 1) continue;
    if (!allowed.has(m)) {
      // Could be a known outside-universe ticker mentioned in news (JNJ, MRK, etc).
      // Only flag if it looks like a ticker AND is in our known universe of
      // cross-sector candidates. We keep this permissive and rely on the
      // validator to catch clearly wrong ones — but explicitly check the
      // cross-sector list from known constituents.
      if (KNOWN_FOREIGN_TICKERS.has(m)) return m;
    }
  }
  return null;
}

// Union of all tickers across the 8 sectors (from SECTOR_BUCKET in the
// factor builders). Used to detect cross-sector contamination without
// flagging every uppercase noun.
const KNOWN_FOREIGN_TICKERS = new Set([
  "AAPL","MSFT","NVDA","INTC","AMD",
  "AMZN","TSLA","HD",
  "GOOGL","META","NFLX",
  "JPM","GS","BAC","MS","BRK.B",
  "XOM","CVX",
  "UNH","LLY","JNJ",
  "PG","KO",
  "CAT","BA",
]);

function buildPrompt(input) {
  const dataBlock = {
    as_of: input.as_of,
    sector_date: input.sector_date,
    sector: input.sector,
    factors: input.factors,
    constituents: input.constituents,
    news: input.news,
    earnings_calendar: input.earnings,
    regime: input.regime,
    landscape_top_bullet: input.landscape?.top_bullet || null,
    previous_identification: input.previous?.identification || null,
  };

  return [
    `You are a senior sector analyst writing the identification block for a professional investor's sector-specific daily note.`,
    ``,
    `Your job: diagnose what is actually happening inside ${input.sector}. This is a single-sector deep-read — not a comparison to other sectors.`,
    ``,
    `Produce 3 to 5 bullets, ranked by impact. Each bullet MUST:`,
    `  - stay inside ${input.sector} (ticker citations must come from the constituents list below),`,
    `  - carry all of: headline, number, event, interpretation, source,`,
    `  - tie a specific factor or constituent-level metric to a forward-looking meaning.`,
    ``,
    `Each bullet MUST contain ALL of:`,
    `  - headline: one sharp sentence naming the driver (e.g. "Earnings momentum breaking wider than peers")`,
    `  - number:   a specific numeric value drawn ONLY from the DATA below`,
    `  - event:    dated anchor — a news headline from news[] OR a factor reading like "${input.sector_date} regime_fit"`,
    `  - interpretation: the CRITICAL READ — what this factor/news means for the sector's forward trajectory. Not a restatement of the number. ≥20 chars.`,
    `  - source:   { table: "...", id: "..." } — e.g. { "table": "SECTOR_FACTORS_daily", "id": "${input.sector}@${input.sector_date}" } or { "table": "BETA_12_News_digest", "id": "<ticker>@<date>" } or { "table": "STOCK_FACTORS_daily", "id": "<ticker>@${input.sector_date}" }`,
    ``,
    `Rules (HARD):`,
    `  1. Every number cited MUST appear verbatim in the DATA block. No invented numbers.`,
    `  2. Ticker citations MUST come from input.constituents. Do NOT reference tickers outside this sector.`,
    `  3. Do not repeat the macro/regime or the cross-sector landscape — those are context only. Interpret THIS sector.`,
    `  4. Also return \`missing_factors\`: concrete signals that would change your read but are not in the input (e.g. "no flow data", "no Q1 guidance").`,
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
