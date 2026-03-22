// ============================================================
// Unified News Search Worker
// Mon/Wed/Fri: deep search (tickers + macro)
// Tue/Thu: light search (tickers + macro)
// Calendar events: triggered only on scheduled dates
// ============================================================

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

const CALENDAR = [
  { event: "FOMC Meeting", date: "2026-01-28", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-03-18", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-04-29", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-06-17", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-07-29", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-09-16", notes: "Decision + Powell presser + SEP" },
  { event: "FOMC Meeting", date: "2026-10-28", notes: "Decision + Powell presser" },
  { event: "FOMC Meeting", date: "2026-12-09", notes: "Decision + Powell presser + SEP" },
  { event: "CPI", date: "2026-01-13" }, { event: "CPI", date: "2026-02-11" },
  { event: "CPI", date: "2026-03-11" }, { event: "CPI", date: "2026-04-10" },
  { event: "CPI", date: "2026-05-12" }, { event: "CPI", date: "2026-06-10" },
  { event: "CPI", date: "2026-07-14" }, { event: "CPI", date: "2026-08-12" },
  { event: "CPI", date: "2026-09-11" }, { event: "CPI", date: "2026-10-14" },
  { event: "CPI", date: "2026-11-10" }, { event: "CPI", date: "2026-12-10" },
  { event: "PPI", date: "2026-01-14" }, { event: "PPI", date: "2026-02-12" },
  { event: "PPI", date: "2026-03-12" }, { event: "PPI", date: "2026-04-14" },
  { event: "PPI", date: "2026-05-13" }, { event: "PPI", date: "2026-06-11" },
  { event: "PPI", date: "2026-07-15" }, { event: "PPI", date: "2026-08-13" },
  { event: "PPI", date: "2026-09-10" }, { event: "PPI", date: "2026-10-15" },
  { event: "PPI", date: "2026-11-13" }, { event: "PPI", date: "2026-12-15" },
  { event: "Employment Situation", date: "2026-01-09" }, { event: "Employment Situation", date: "2026-02-06" },
  { event: "Employment Situation", date: "2026-03-06" }, { event: "Employment Situation", date: "2026-04-03" },
  { event: "Employment Situation", date: "2026-05-08" }, { event: "Employment Situation", date: "2026-06-05" },
  { event: "Employment Situation", date: "2026-07-02" }, { event: "Employment Situation", date: "2026-08-07" },
  { event: "Employment Situation", date: "2026-09-04" }, { event: "Employment Situation", date: "2026-10-02" },
  { event: "Employment Situation", date: "2026-11-06" }, { event: "Employment Situation", date: "2026-12-04" },
  { event: "GDP Advance", date: "2026-01-29" }, { event: "GDP Advance", date: "2026-04-30" },
  { event: "GDP Advance", date: "2026-07-30" }, { event: "GDP Advance", date: "2026-10-29" },
];

// ============================================================
// JSON schemas for structured output
// ============================================================

const EVENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    date: { type: "string" },
    headline: { type: "string" },
    summary: { type: "string" },
    sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    magnitude: { type: "number" },
    sources: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  },
  required: ["id", "date", "headline", "summary", "sentiment", "magnitude", "sources", "confidence"],
  additionalProperties: false
};

const TICKER_SCHEMA = {
  type: "object",
  properties: {
    market_theme: { type: "string" },
    tickers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          has_news: { type: "boolean" },
          date: { type: "string" },
          headline: { type: "string" },
          summary: { type: "string" },
          sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
          magnitude: { type: "number" },
          sources: { type: "array", items: { type: "string" } }
        },
        required: ["ticker", "has_news", "date", "headline", "summary", "sentiment", "magnitude", "sources"],
        additionalProperties: false
      }
    }
  },
  required: ["market_theme", "tickers"],
  additionalProperties: false
};

const MACRO_SCHEMA = {
  type: "object",
  properties: {
    geopolitics: {
      type: "object",
      properties: {
        events: { type: "array", items: EVENT_SCHEMA },
        sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        magnitude: { type: "number" }
      },
      required: ["events", "sentiment", "magnitude"],
      additionalProperties: false
    },
    regulatory_fiscal: {
      type: "object",
      properties: {
        events: { type: "array", items: EVENT_SCHEMA },
        sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        magnitude: { type: "number" }
      },
      required: ["events", "sentiment", "magnitude"],
      additionalProperties: false
    },
    sector_pulse: {
      type: "object",
      properties: {
        events: { type: "array", items: EVENT_SCHEMA },
        sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        magnitude: { type: "number" }
      },
      required: ["events", "sentiment", "magnitude"],
      additionalProperties: false
    },
    summary: { type: "string" },
    overall_sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    overall_magnitude: { type: "number" },
    sector_sentiments: {
      type: "object",
      properties: {
        tech: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false },
        financials: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false },
        energy: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false },
        healthcare: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false },
        consumer: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false },
        industrials: { type: "object", properties: { sentiment: { type: "string", enum: ["bullish","bearish","neutral"] }, magnitude: { type: "number" } }, required: ["sentiment","magnitude"], additionalProperties: false }
      },
      required: ["tech", "financials", "energy", "healthcare", "consumer", "industrials"],
      additionalProperties: false
    }
  },
  required: ["geopolitics", "regulatory_fiscal", "sector_pulse", "summary", "overall_sentiment", "overall_magnitude", "sector_sentiments"],
  additionalProperties: false
};

const CALENDAR_SCHEMA = {
  type: "object",
  properties: {
    layer: { type: "string" },
    events: { type: "array", items: EVENT_SCHEMA },
    sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    magnitude: { type: "number" }
  },
  required: ["layer", "events", "sentiment", "magnitude"],
  additionalProperties: false
};

// ============================================================
// Main handlers
// ============================================================

export default {
  async scheduled(event, env, ctx) {
    const dayOfWeek = new Date().getDay();
    const today = new Date().toISOString().slice(0, 10);
    if (dayOfWeek === 0 || dayOfWeek === 6) return; // weekend guard

    const isDeep = [1, 3, 5].includes(dayOfWeek);
    console.log(`News unified: ${isDeep ? "DEEP" : "LIGHT"} scan for ${today}`);

    await runAll(env, today, isDeep);
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "deep";
    const today = new Date().toISOString().slice(0, 10);

    if (url.pathname === "/run") {
      const result = await runAll(env, today, mode === "deep");
      return Response.json(result);
    }
    if (url.pathname === "/test-ticker") {
      const isDeep = mode === "deep";
      try {
        const result = await runTickerScan(env, today, isDeep);
        return Response.json({ ticker_scan: result ? { ok: true, events: result.tickers?.filter(t => t.has_news).length, theme: result.market_theme } : { ok: false, error: "null result" } });
      } catch (err) {
        return Response.json({ ticker_scan: { ok: false, error: err.message, stack: err.stack?.slice(0, 300) } });
      }
    }
    if (url.pathname === "/test-macro") {
      const isDeep = mode === "deep";
      try {
        const result = await runMacroScan(env, today, isDeep);
        return Response.json({ macro_scan: result ? { ok: true, overall_sentiment: result.overall_sentiment, overall_magnitude: result.overall_magnitude } : { ok: false, error: "null result" } });
      } catch (err) {
        return Response.json({ macro_scan: { ok: false, error: err.message } });
      }
    }
    if (url.pathname === "/test-calendar") {
      const result = await runCalendarIfNeeded(env, today);
      return Response.json({ calendar: result });
    }
    return new Response("Not found. Use /run, /test-ticker, /test-macro, /test-calendar", { status: 404 });
  },
};

// ============================================================
// Core pipeline
// ============================================================

async function runAll(env, today, isDeep) {
  const results = { today, mode: isDeep ? "deep" : "light" };

  // 1) Ticker + Macro in PARALLEL (both are independent OpenAI calls)
  const [tickerResult, macroResult] = await Promise.allSettled([
    runTickerScan(env, today, isDeep),
    runMacroScan(env, today, isDeep)
  ]);

  const tickerData = tickerResult.status === "fulfilled" ? tickerResult.value : null;
  const macroData = macroResult.status === "fulfilled" ? macroResult.value : null;

  if (tickerData) {
    await writeTickerData(env, today, tickerData);
    results.tickers = { ok: true, withNews: tickerData.tickers.filter(t => t.has_news).length };
  } else {
    results.tickers = { ok: false, error: tickerResult.reason?.message };
  }

  if (macroData) {
    await writeMacroData(env, today, macroData, null);
    results.macro = { ok: true, overall_sentiment: macroData.overall_sentiment, overall_magnitude: macroData.overall_magnitude };
  } else {
    results.macro = { ok: false, error: macroResult.reason?.message };
  }

  // 2) Calendar (conditional, sequential — only fires on event days)
  const calendarData = await runCalendarIfNeeded(env, today);
  if (calendarData) {
    await updateCalendarData(env, today, calendarData);
    results.calendar = { ok: true, events: calendarData.events?.length || 0 };
  } else {
    results.calendar = { skipped: true };
  }

  console.log(`News unified done: ${JSON.stringify(results)}`);
  return results;
}

// ============================================================
// OpenAI call helper
// ============================================================

async function callOpenAI(env, prompt, schema, schemaName) {
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.length < 10) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const j = await res.json();
  let text = "";
  if (j.output) {
    for (const block of j.output) {
      if (block.type === "message") {
        for (const c of block.content) {
          if (c.type === "output_text") text = c.text;
        }
      }
    }
  }

  if (!text) {
    throw new Error(`Empty AI output: ${JSON.stringify(j).slice(0, 300)}`);
  }

  return JSON.parse(text);
}

// ============================================================
// Ticker scan
// ============================================================

async function runTickerScan(env, today, isDeep) {
  const prompt = buildTickerPrompt(today, isDeep);
  console.log(`Ticker scan (${isDeep ? "deep" : "light"})...`);
  const result = await callOpenAI(env, prompt, TICKER_SCHEMA, "ticker_news_scan");
  if (result) {
    const withNews = result.tickers?.filter(t => t.has_news).length || 0;
    console.log(`Ticker scan done: ${withNews}/${TICKERS.length} with news`);
  }
  return result;
}

function buildTickerPrompt(today, isDeep) {
  const tickerList = TICKERS.join(", ");

  if (isDeep) {
    return `
You are a financial news analyst covering the US equity market. Search the internet for the most important and talked-about news for each of these tickers:

${tickerList}

TODAY'S DATE: ${today}

GROUP THEM BY SECTOR FOR EFFICIENT SEARCHING:
- TECH/AI: AAPL, MSFT, GOOGL, AMZN, NVDA, META, INTC, AMD, NFLX
- FINANCIALS: JPM, GS, BAC, MS
- ENERGY: XOM, CVX
- HEALTHCARE: UNH, LLY, JNJ
- CONSUMER/INDUSTRIAL: PG, KO, HD, CAT, BA, TSLA, BRK.B

YOUR TASK:
1. Search for each sector's recent news, then identify ticker-specific developments
2. For each ticker with significant news, provide the most important story
3. If a ticker has NO significant news, set has_news=false with empty fields
4. Provide a market_theme summarizing today's dominant narrative (1-2 sentences)

WHAT COUNTS AS SIGNIFICANT:
- Earnings reports or guidance changes
- M&A activity, major partnerships, or spin-offs
- Analyst upgrades/downgrades with price target changes
- Regulatory actions (SEC, FDA, FTC, antitrust)
- Executive changes, lawsuits, product launches with market impact
- Sector-wide moves that affect specific tickers

CRITICAL RULES:
- EXACT DATE on every event. Do not guess dates.
- CROSS-CHECK: cite at least 2 sources per event.
- Sentiment magnitude: -1.0 = maximally bearish, +1.0 = maximally bullish.
- Do NOT force news. If a ticker is quiet, mark has_news=false.
- Summaries should be 200-400 characters.
- Rank by importance in the tickers array (most important first).

Respond in the required JSON format.
`.trim();
  }

  // Light scan (Tue/Thu)
  return `
You are a financial news analyst. Do a quick scan for any BREAKING or SIGNIFICANT news about these tickers:

${tickerList}

TODAY'S DATE: ${today}

Only report genuinely significant developments. This is a light scan — skip routine price movements, minor analyst notes, or recycled stories from previous days.

REPORT ONLY:
- Earnings surprises or major guidance changes
- M&A announcements
- FDA decisions, regulatory actions
- Major executive changes
- Significant legal developments
- Surprise macro impacts on specific tickers

For each ticker with significant news, provide a brief summary (100-200 chars).
If a ticker has nothing significant, set has_news=false.
Provide a market_theme (1 sentence).

CRITICAL: EXACT DATES. Cite sources. Magnitude -1.0 to +1.0.

Respond in the required JSON format.
`.trim();
}

// ============================================================
// Macro scan (layers 2+3+4 combined)
// ============================================================

async function runMacroScan(env, today, isDeep) {
  // Fetch previous summary for context
  const prevMacro = await env.DB.prepare(`
    SELECT summary FROM BETA_11_Macro_news
    WHERE date < ? ORDER BY date DESC LIMIT 1
  `).bind(today).first();

  const prompt = buildMacroPrompt(today, isDeep, prevMacro?.summary || null);
  console.log(`Macro scan (${isDeep ? "deep" : "light"})...`);
  const result = await callOpenAI(env, prompt, MACRO_SCHEMA, "macro_news_scan");
  if (result) {
    console.log(`Macro scan done: ${result.overall_sentiment} (${result.overall_magnitude})`);
  }
  return result;
}

function buildMacroPrompt(today, isDeep, previousSummary) {
  const prevContext = previousSummary
    ? `\nPREVIOUS DAY'S MACRO SUMMARY (distinguish new from old):\n${previousSummary}\n`
    : "";

  if (isDeep) {
    return `
You are a macro-market intelligence analyst covering the US market. Search the internet for today's most important developments across three areas. Provide a unified analysis with per-section detail AND an overall synthesis.

TODAY'S DATE: ${today}
${prevContext}

=== SECTION 1: GEOPOLITICS ===
Search for:
1. CONFLICTS & MILITARY: Ukraine-Russia, Middle East (Israel, Iran, Yemen/Houthis), Taiwan Strait, North Korea
2. STRATEGIC COMMERCE: Strait of Hormuz, Suez Canal, shipping routes, Panama Canal, freight costs
3. TRADE WARS: US-China tariffs, EU disputes, sanctions enforcement, export controls (chips, oil)
4. DIPLOMACY: G7/G20, bilateral summits, UN Security Council votes, NATO
5. SANCTIONS: New sanctions on Russia/Iran/China entities, enforcement changes

=== SECTION 2: REGULATORY & FISCAL ===
Search for:
1. TAX POLICY: Corporate tax changes, capital gains proposals, tax reform bills
2. REGULATION: SEC rules, FDA decisions, FTC antitrust, EPA, bank capital requirements, crypto
3. MONETARY POLICY (non-FOMC): Fed governor speeches, ECB/BOJ decisions affecting US
4. FISCAL POLICY: Government shutdown risk, debt ceiling, infrastructure bills, defense budget
5. STATE-LEVEL: AI regulation, energy policy, EV mandates

=== SECTION 3: SECTOR PULSE ===
Search for developments in:
1. TECHNOLOGY/AI: AI spending, chip demand, cloud, Big Tech regulation, semiconductor supply
2. FINANCIALS: Yield curve, bank earnings, credit quality, IPO/M&A flow
3. ENERGY: Oil prices (WTI/Brent), OPEC+, US production, natural gas, renewables
4. HEALTHCARE: FDA approvals, GLP-1 drugs, Medicare/Medicaid policy
5. CONSUMER: Spending data, retail earnings, housing, auto sales
6. INDUSTRIALS: Infrastructure spending, defense, manufacturing PMI, aerospace

=== SYNTHESIS ===
After searching all three sections, provide:
- A unified summary (~1500 chars) of today's market-moving developments
- Overall sentiment and magnitude (-1.0 to +1.0)
- Per-sector sentiments (tech, financials, energy, healthcare, consumer, industrials)

CRITICAL RULES:
- EXACT DATES on every event.
- CROSS-CHECK: 2+ sources per event. Confidence "high" only if 3+ agree.
- Only events with US market impact. Do NOT pad with routine news.
- Separate events as NEWS1, NEWS2, NEWS3 within each section.
- If a section is quiet, return fewer events. Quality over quantity.

Respond in the required JSON format.
`.trim();
  }

  // Light macro scan (Tue/Thu)
  return `
You are a macro-market analyst. Quick scan for SIGNIFICANT developments affecting the US market today.

TODAY'S DATE: ${today}
${prevContext}

Check briefly across three areas:
1. GEOPOLITICS: Any escalation/de-escalation in conflicts, trade, sanctions, shipping routes
2. REGULATORY/FISCAL: Any new regulations, tax proposals, Fed speeches, fiscal policy changes
3. SECTOR PULSE: Any sector-wide moves in tech/financials/energy/healthcare/consumer/industrials

Only report genuinely significant, market-moving developments. Skip routine updates.
Keep summaries to 100-200 chars. If an area is quiet, return empty events array.
Provide overall and per-sector sentiments.

CRITICAL: EXACT DATES. Cite sources. Magnitude -1.0 to +1.0.

Respond in the required JSON format.
`.trim();
}

// ============================================================
// Calendar (Layer 1) — conditional
// ============================================================

async function runCalendarIfNeeded(env, today) {
  const todayEvents = CALENDAR.filter(e => e.date === today);
  if (todayEvents.length === 0) return null;

  console.log(`Calendar event(s) today: ${todayEvents.map(e => e.event).join(", ")}`);

  // Fetch macro data for context
  const { results: macroData } = await env.DB.prepare(`
    SELECT type, summary FROM BETA_03_Macro
    WHERE date >= ? ORDER BY date DESC LIMIT 20
  `).bind(today).all();

  const prevMacro = await env.DB.prepare(`
    SELECT summary FROM BETA_11_Macro_news
    WHERE date < ? ORDER BY date DESC LIMIT 1
  `).bind(today).first();

  const prompt = buildCalendarPrompt(today, todayEvents, macroData, prevMacro?.summary || null);
  const result = await callOpenAI(env, prompt, CALENDAR_SCHEMA, "calendar_layer");
  if (result) {
    result.layer = "economic_calendar";
    console.log(`Calendar scan done: ${result.events?.length || 0} events`);
  }
  return result;
}

function buildCalendarPrompt(today, calendarEvents, macroData, previousSummary) {
  const prevContext = previousSummary
    ? `\nPREVIOUS DAY'S SUMMARY (distinguish new from old):\n${previousSummary}\n`
    : "";

  const calendarBlock = calendarEvents.length
    ? `TODAY'S SCHEDULED RELEASES:\n${calendarEvents.map(e => `- ${e.event}${e.notes ? ` (${e.notes})` : ""}`).join("\n")}`
    : "No major scheduled releases today.";

  const dataBlock = macroData?.length
    ? `\nLATEST INDICATOR DATA FROM OUR SCRAPERS:\n${macroData.map(d => `- ${d.type}: ${d.summary}`).join("\n")}`
    : "";

  return `
You are a macro-economic analyst. Search the internet for today's economic indicator releases and market reaction.

TODAY'S DATE: ${today}

${calendarBlock}
${dataBlock}
${prevContext}

YOUR TASK:
1. If there are scheduled releases today (CPI, PPI, Employment, GDP, FOMC), search for:
   - The ACTUAL NUMBER released (e.g., CPI came in at 3.2% vs 3.1% expected)
   - Whether it beat, met, or missed consensus expectations
   - Market reaction (stocks, bonds, dollar)
   - Analyst commentary on what it means for Fed policy
   - FOMC: search for the decision, dot plot changes, Powell's press conference tone
2. If no scheduled release today, search for:
   - Any Fed speakers and what they said
   - Jobless claims (weekly Thursday release)
   - Treasury auction results

CRITICAL RULES:
- EXACT DATES on every event.
- CROSS-CHECK: cite at least 2 sources per event. Confidence "high" only if 3+ agree.
- Separate each event as NEWS1, NEWS2, NEWS3 etc.
- Sentiment: dovish surprise / growth beat = bullish. Hawkish surprise / contraction = bearish.

Respond in the required JSON format.
`.trim();
}

// ============================================================
// D1 write: ticker data
// ============================================================

async function writeTickerData(env, today, tickerData) {
  const db = env.DB;
  const now = new Date().toISOString();
  const dayOfWeek = new Date().getDay();
  const isMonday = dayOfWeek === 1;

  const withNews = tickerData.tickers.filter(t => t.has_news);

  for (const item of withNews) {
    const T = item.ticker;
    const id = await shortHash(`AI-Search|${item.date}|${T}|${item.headline}`);

    // Write to BETA_01_News
    await db.prepare(`
      INSERT INTO BETA_01_News
        (id, tickers, date, source, title, summary, sentiment, magnitude, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary=excluded.summary, sentiment=excluded.sentiment,
        magnitude=excluded.magnitude, created_at=excluded.created_at
    `).bind(id, JSON.stringify([T]), item.date, "AI-Search", item.headline, item.summary, item.sentiment, item.magnitude, now).run();

    // Determine last_important
    let lastImportant = item.summary;
    let lastImportantDate = item.date;
    if (!isMonday) {
      const prev = await db.prepare(`
        SELECT last_important, last_important_date, magnitude
        FROM ALPHA_05_Daily_news WHERE ticker = ? ORDER BY created_at DESC LIMIT 1
      `).bind(T).first();
      if (prev?.last_important && Math.abs(prev.magnitude || 0) > Math.abs(item.magnitude || 0)) {
        lastImportant = prev.last_important;
        lastImportantDate = prev.last_important_date;
      }
    }

    // Check SEC filings
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const { results: secFilings } = await db.prepare(`
      SELECT id FROM ALPHA_01_Reports WHERE ticker = ? AND type IN ('10-Q','10-K') AND date >= ? AND date <= ?
    `).bind(T, twoDaysAgo.toISOString().slice(0, 10), today).all();

    const idDate = new Date();
    if (!isMonday) { const d = dayOfWeek === 0 ? 6 : dayOfWeek - 1; idDate.setDate(idDate.getDate() - d); }
    const dailyId = `${T}-${idDate.toISOString().slice(0, 10)}`;
    const label = item.magnitude > 0 ? "BULLISH" : item.magnitude < 0 ? "BEARISH" : "NEUTRAL";
    const fullSummary = `[${label} ${item.magnitude > 0 ? "+" : ""}${item.magnitude.toFixed(1)}] ${item.summary}`;

    await db.prepare(`
      INSERT INTO ALPHA_05_Daily_news
        (id, ticker, summary, todays_important, last_important, last_important_date, new_sec, sentiment, magnitude, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary=excluded.summary, todays_important=excluded.todays_important,
        last_important=excluded.last_important, last_important_date=excluded.last_important_date,
        new_sec=excluded.new_sec, sentiment=excluded.sentiment, magnitude=excluded.magnitude,
        created_at=excluded.created_at
    `).bind(dailyId, T, fullSummary, item.headline, lastImportant, lastImportantDate, JSON.stringify(secFilings.map(f => f.id)), item.sentiment, item.magnitude, now).run();

    if (secFilings.length > 0) {
      await db.prepare(`INSERT INTO PROC_01_Job_queue (date, worker, input, status) VALUES (?, ?, ?, ?)`).bind(now, "trend-orchestrator", JSON.stringify({ ticker: T }), "pending").run();
    }
  }

  // Handle non-news tickers: check Form 4/8-K
  const newsSet = new Set(withNews.map(t => t.ticker));
  for (const T of TICKERS) {
    if (newsSet.has(T)) continue;
    const { results: reports } = await db.prepare(`
      SELECT id, summary FROM ALPHA_01_Reports WHERE ticker = ? AND date = ? AND type IN ('4','8-K')
    `).bind(T, today).all();
    for (const r of reports) {
      if (!r.summary) {
        await db.prepare(`INSERT INTO PROC_01_Job_queue (date, worker, input, status) VALUES (?, ?, ?, ?)`).bind(now, "report-orchestrator", JSON.stringify({ report_id: r.id }), "pending").run();
      }
    }
  }

  console.log(`Wrote ${withNews.length} ticker news items to D1`);
}

// ============================================================
// D1 write: macro data
// ============================================================

async function writeMacroData(env, today, macroData, calendarData) {
  const db = env.DB;
  const now = new Date().toISOString();
  const id = await shortHash(`macro-news|${today}`);

  await db.prepare(`
    INSERT INTO BETA_11_Macro_news
      (id, date, layer_calendar, layer_geopolitics, layer_regulatory, layer_sectors, layer_wave,
       summary, overall_sentiment, overall_magnitude, sector_sentiments, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      layer_calendar = excluded.layer_calendar,
      layer_geopolitics = excluded.layer_geopolitics,
      layer_regulatory = excluded.layer_regulatory,
      layer_sectors = excluded.layer_sectors,
      layer_wave = excluded.layer_wave,
      summary = excluded.summary,
      overall_sentiment = excluded.overall_sentiment,
      overall_magnitude = excluded.overall_magnitude,
      sector_sentiments = excluded.sector_sentiments,
      created_at = excluded.created_at
  `).bind(
    id,
    today,
    calendarData ? JSON.stringify(calendarData) : null,
    JSON.stringify({ layer: "geopolitics", ...macroData.geopolitics }),
    JSON.stringify({ layer: "regulatory_fiscal", ...macroData.regulatory_fiscal }),
    JSON.stringify({ layer: "sector_pulse", ...macroData.sector_pulse }),
    null, // Layer 5 (the_wave) dropped
    macroData.summary,
    macroData.overall_sentiment,
    macroData.overall_magnitude,
    JSON.stringify(macroData.sector_sentiments || {}),
    now
  ).run();

  console.log(`Wrote macro news to D1: ${macroData.overall_sentiment} (${macroData.overall_magnitude})`);
}

async function updateCalendarData(env, today, calendarData) {
  const db = env.DB;
  const id = await shortHash(`macro-news|${today}`);

  await db.prepare(`
    UPDATE BETA_11_Macro_news
    SET layer_calendar = ?
    WHERE id = ?
  `).bind(JSON.stringify(calendarData), id).run();

  console.log(`Updated calendar layer for ${today}`);
}

// ============================================================
// Helpers
// ============================================================

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
