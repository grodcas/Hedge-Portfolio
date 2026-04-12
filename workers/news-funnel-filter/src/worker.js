/**
 * NEWS FUNNEL — STAGE 2: RELEVANCE FILTER (v2 — 33 parallel focused calls)
 *
 * Replaces the old single-call filter with 33 parallel gpt-5-mini calls:
 *   - 25 per-ticker calls: each sees only its own headlines (focused context)
 *   - 8 per-macro-section calls: each sees only its own category headlines
 *
 * Rationale: GPT attention degrades when it juggles many tasks. One focused
 * task per call produces sharper selections. gpt-5-mini is cheap enough to
 * afford 33 calls per run.
 *
 * Output shape is identical to the old filter so news-funnel-orchestrator
 * does not need to change.
 */

const MODEL = "gpt-5-mini";

const MACRO_CATEGORIES = [
  { id: "central_banks", label: "Central Banks & Monetary Policy" },
  { id: "inflation",     label: "Inflation & Prices" },
  { id: "geopolitics",   label: "Geopolitics & Conflicts" },
  { id: "trade",         label: "Trade & Tariffs" },
  { id: "energy",        label: "Energy & Commodities" },
  { id: "labor",         label: "Labor Market" },
  { id: "tech",          label: "Technology & AI" },
  { id: "markets",       label: "Markets & Indices" },
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/filter-headlines")
      return new Response("Not found", { status: 404 });

    const { headlines, date } = await req.json();
    if (!headlines) return new Response("headlines missing", { status: 400 });

    const today = date || new Date().toISOString().slice(0, 10);
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    console.log(`[FILTER v2] Starting parallel filtering for ${today}`);

    // ================================================================
    // Build per-ticker and per-macro tasks
    // ================================================================
    const tickerFeeds = (headlines.ticker || []).filter(t => t.items && t.items.length > 0);
    const macroFeeds = (headlines.macro || []).filter(m => m.items && m.items.length > 0);

    console.log(`[FILTER v2] ${tickerFeeds.length} tickers, ${macroFeeds.length} macro sections`);

    // ================================================================
    // Fire all calls in parallel
    // ================================================================
    const tickerPromises = tickerFeeds.map(t =>
      filterTickerHeadlines(t.ticker, t.items, today, apiKey).catch(err => {
        console.error(`[FILTER v2] ${t.ticker} failed: ${err.message}`);
        return { ticker: t.ticker, headlines: [] };
      })
    );

    const macroPromises = macroFeeds.map(m => {
      const cat = MACRO_CATEGORIES.find(c => c.id === m.category) || { id: m.category, label: m.label || m.category };
      return filterMacroHeadlines(cat, m.items, today, apiKey).catch(err => {
        console.error(`[FILTER v2] macro ${cat.id} failed: ${err.message}`);
        return [];
      });
    });

    const [tickerResults, macroResultArrays] = await Promise.all([
      Promise.all(tickerPromises),
      Promise.all(macroPromises),
    ]);

    // Flatten macro results (each call returns an array of picked headlines)
    const macroNews = macroResultArrays.flat();

    // Renumber macro ranks across all categories (1 = most important overall)
    macroNews.sort((a, b) => (b.magnitude || 0) * (b.magnitude > 0 ? 1 : -1) - (a.magnitude || 0) * (a.magnitude > 0 ? 1 : -1));
    macroNews.forEach((item, i) => { item.rank = i + 1; });

    const stats = {
      tickers_with_news: tickerResults.filter(t => t.headlines.length > 0).length,
      total_ticker_headlines: tickerResults.reduce((s, t) => s + t.headlines.length, 0),
      total_macro_headlines: macroNews.length,
    };

    console.log(`[FILTER v2] Done. ${stats.tickers_with_news} tickers with news, ${stats.total_ticker_headlines} ticker headlines, ${stats.total_macro_headlines} macro headlines`);

    return Response.json({
      ok: true,
      date: today,
      ticker_news: tickerResults,
      macro_news: macroNews,
      stats,
    });
  },
};

// ================================================================
// Per-ticker filter call
// ================================================================
async function filterTickerHeadlines(ticker, items, today, apiKey) {
  const compact = items.slice(0, 15).map((h, i) =>
    `${i + 1}. [${h.date || "?"}] (freq:${h.frequency || 1}) ${h.title} — ${h.source || "unknown"}`
  ).join("\n");

  const systemMsg = `You are an equity analyst selecting the most market-moving headlines for a specific US stock. Output JSON only.`;

  const userMsg = `TICKER: ${ticker}
TODAY: ${today}

HEADLINES:
${compact}

TASK: Pick the 1 to 4 most market-relevant headlines for ${ticker}.

RULES:
- Pick 1 minimum (even on slow days, pick the best available).
- Pick up to 4 ONLY if multiple genuinely material events happened (rare).
- Prefer today's news. Older news only if high frequency (3+).
- Focus on: earnings, product launches, M&A, regulatory, executive changes, lawsuits, guidance, analyst actions.
- IGNORE: generic conferences, SEO content, irrelevant geographies, opinions.
- Do not invent headlines. Use EXACT titles from the list.

OUTPUT (strict JSON, no markdown):
{
  "headlines": [
    {
      "rank": 1,
      "title": "exact title from above",
      "source": "source name",
      "date": "YYYY-MM-DD",
      "frequency": 1,
      "relevance": "one sentence: why this matters for ${ticker}",
      "sentiment": "bullish" | "bearish" | "neutral",
      "magnitude": -1.0 to 1.0
    }
  ]
}`;

  const data = await callGpt5Mini(systemMsg, userMsg, apiKey);
  const parsed = parseJsonFromResponse(data);
  const headlines = Array.isArray(parsed?.headlines) ? parsed.headlines.slice(0, 4) : [];

  // Validate each headline
  const clean = headlines
    .filter(h => h.title && typeof h.title === "string")
    .map((h, i) => ({
      rank: typeof h.rank === "number" ? h.rank : i + 1,
      title: h.title,
      source: h.source || "",
      date: h.date || today,
      frequency: typeof h.frequency === "number" ? h.frequency : 1,
      relevance: h.relevance || "",
      sentiment: ["bullish", "bearish", "neutral"].includes(h.sentiment) ? h.sentiment : "neutral",
      magnitude: typeof h.magnitude === "number" ? Math.max(-1, Math.min(1, h.magnitude)) : 0,
    }));

  return { ticker, headlines: clean };
}

// ================================================================
// Per-macro-section filter call
// ================================================================
async function filterMacroHeadlines(category, items, today, apiKey) {
  const compact = items.slice(0, 15).map((h, i) =>
    `${i + 1}. [${h.date || "?"}] (freq:${h.frequency || 1}) ${h.title} — ${h.source || "unknown"}`
  ).join("\n");

  const systemMsg = `You are a macro analyst selecting the most impactful headlines in a specific category that affect US equity markets. Output JSON only.`;

  const userMsg = `CATEGORY: ${category.label} (${category.id})
TODAY: ${today}

HEADLINES:
${compact}

TASK: Pick the 1 to 2 most impactful headlines in this category that affect US equity markets today.

RULES:
- Select the headlines that would meaningfully move indices, sectors, or specific stocks.
- Prefer today's news. Older news only if high frequency (3+) or unresolved.
- IGNORE: local politics with no US market impact, routine diplomatic meetings, opinion pieces.
- Think: how does this affect sectors in our portfolio (tech, pharma, oil/energy, banks, consumer, industrial)?
- Do not invent headlines. Use EXACT titles from the list.

OUTPUT (strict JSON, no markdown):
{
  "headlines": [
    {
      "title": "exact title from above",
      "source": "source name",
      "date": "YYYY-MM-DD",
      "frequency": 1,
      "portfolio_impact": "one sentence: which sectors/stocks are affected and how",
      "sentiment": "bullish" | "bearish" | "neutral",
      "magnitude": -1.0 to 1.0
    }
  ]
}`;

  const data = await callGpt5Mini(systemMsg, userMsg, apiKey);
  const parsed = parseJsonFromResponse(data);
  const headlines = Array.isArray(parsed?.headlines) ? parsed.headlines.slice(0, 2) : [];

  // Attach category to each and validate
  return headlines
    .filter(h => h.title && typeof h.title === "string")
    .map(h => ({
      rank: 0, // Will be renumbered after all categories collected
      category: category.id,
      title: h.title,
      source: h.source || "",
      date: h.date || today,
      frequency: typeof h.frequency === "number" ? h.frequency : 1,
      portfolio_impact: h.portfolio_impact || "",
      sentiment: ["bullish", "bearish", "neutral"].includes(h.sentiment) ? h.sentiment : "neutral",
      magnitude: typeof h.magnitude === "number" ? Math.max(-1, Math.min(1, h.magnitude)) : 0,
    }));
}

// ================================================================
// Shared GPT-5-mini call
// ================================================================
async function callGpt5Mini(systemMsg, userMsg, apiKey) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${MODEL} ${res.status}: ${errText.slice(0, 200)}`);
  }

  return await res.json();
}

// ================================================================
// Extract text from /v1/responses output format and parse JSON
// ================================================================
function parseJsonFromResponse(data) {
  if (!data?.output) return null;

  const text = data.output
    .flatMap(item =>
      item.type === "message"
        ? item.content?.filter(c => c.type === "output_text")?.map(c => c.text) ?? []
        : []
    )
    .join("")
    .trim();

  if (!text) return null;

  // Strip markdown fences if any
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}
