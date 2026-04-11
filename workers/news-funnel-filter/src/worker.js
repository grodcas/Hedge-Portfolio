/**
 * NEWS FUNNEL — STAGE 2: RELEVANCE FILTER
 *
 * Receives all gathered headlines.
 * One GPT-4o-mini call to select:
 *   - Per ticker: 1-4 headlines ranked by importance
 *   - Macro: 10 headlines categorized by market impact
 *
 * Selection criteria (from headlines only):
 *   1. Frequency: stories appearing across multiple sources = important
 *   2. Relevance: does it move markets for our portfolio?
 *   3. Date: today's news first; older only if high frequency
 */

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/filter-headlines")
      return new Response("Not found", { status: 404 });

    const { headlines, date } = await req.json();
    if (!headlines) return new Response("headlines missing", { status: 400 });

    const today = date || new Date().toISOString().slice(0, 10);

    // Build the prompt with all headlines
    const prompt = buildFilterPrompt(headlines, today);

    try {
      const ai = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });

      const j = await ai.json();
      const text = j.choices?.[0]?.message?.content?.trim();

      if (!text) {
        console.error("Empty AI output from filter");
        return Response.json({ ok: false, error: "empty_ai_output" });
      }

      const result = JSON.parse(text);

      return Response.json({
        ok: true,
        date: today,
        ticker_news: result.ticker_news || [],
        macro_news: result.macro_news || [],
        stats: {
          tickers_with_news: (result.ticker_news || []).filter(t => t.headlines.length > 0).length,
          total_ticker_headlines: (result.ticker_news || []).reduce((s, t) => s + t.headlines.length, 0),
          total_macro_headlines: (result.macro_news || []).length,
        },
      });
    } catch (err) {
      console.error("Filter error:", err.message);
      return Response.json({ ok: false, error: err.message });
    }
  },
};

function buildFilterPrompt(headlines, today) {
  // Flatten ticker headlines into a compact list
  let tickerSection = "";
  for (const t of headlines.ticker) {
    if (!t.items || t.items.length === 0) continue;
    const lines = t.items.slice(0, 15).map((h, i) =>
      `  ${i + 1}. [${h.date || "?"}] (freq:${h.frequency || 1}) ${h.title} — ${h.source || "unknown"}`
    ).join("\n");
    tickerSection += `\n${t.ticker}:\n${lines}\n`;
  }

  // Flatten macro headlines
  let macroSection = "";
  for (const m of headlines.macro) {
    if (!m.items || m.items.length === 0) continue;
    const lines = m.items.slice(0, 15).map((h, i) =>
      `  ${i + 1}. [${h.date || "?"}] (freq:${h.frequency || 1}) ${h.title} — ${h.source || "unknown"}`
    ).join("\n");
    macroSection += `\n${m.label} (${m.category}):\n${lines}\n`;
  }

  return `You are a senior portfolio analyst for a US equity portfolio with these tickers:
${TICKERS.join(", ")}

Sectors: Technology, Pharma/Healthcare, Oil/Energy, Banks/Finance, Consumer, Industrial, Automotive.

TODAY: ${today}

Your job: From the headlines below, select the MOST MARKET-RELEVANT news.

=== SELECTION RULES ===

FOR EACH TICKER (1-4 headlines, ranked):
- Pick 1 headline minimum per ticker (even if "nothing major" — pick the most relevant)
- Pick up to 4 ONLY if genuinely important things happened (rare)
- Typically 1-2 per ticker is the norm
- RANK by importance: rank 1 = most important
- Prefer TODAY's news. Include older news ONLY if frequency >= 3 (trending story)
- Focus on: earnings, product launches, M&A, analyst actions, regulatory, executive changes, lawsuits, guidance, material partnerships
- IGNORE: generic conferences, mainstream opinions from non-executives, irrelevant geographies, SEO content

FOR MACRO (exactly 10 headlines, categorized):
- Select exactly 10 headlines that move markets
- Categorize each: "geopolitics", "trade", "central_banks", "inflation", "energy", "labor", "tech", "markets", "regulation", "events"
- Think: how does this affect the portfolio? War → oil companies, tariffs → exporters vs domestic, AI breakthroughs → NVDA/tech
- IGNORE: local politics with no market impact, irrelevant regional trade deals, routine diplomatic meetings
- Rank 1-10 by market impact

=== TICKER HEADLINES ===
${tickerSection}

=== MACRO HEADLINES ===
${macroSection}

=== OUTPUT FORMAT (JSON) ===

{
  "ticker_news": [
    {
      "ticker": "AAPL",
      "headlines": [
        {
          "rank": 1,
          "title": "exact headline from above",
          "source": "source name",
          "date": "YYYY-MM-DD",
          "frequency": 3,
          "relevance": "one sentence: why this matters for the stock",
          "sentiment": "bullish|bearish|neutral"
        }
      ]
    }
  ],
  "macro_news": [
    {
      "rank": 1,
      "category": "trade",
      "title": "exact headline from above",
      "source": "source name",
      "date": "YYYY-MM-DD",
      "frequency": 5,
      "portfolio_impact": "one sentence: which portfolio stocks are affected and how",
      "sentiment": "bullish|bearish|neutral"
    }
  ]
}

Include ALL 25 tickers in ticker_news (even if just 1 headline each).
Include exactly 10 items in macro_news.
Use exact headlines from the input — do not rephrase.`.trim();
}
