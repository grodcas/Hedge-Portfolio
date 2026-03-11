export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/curate-news")
      return new Response("Not found", { status: 404 });

    const { results } = await req.json();
    if (!Array.isArray(results))
      return new Response("results array missing", { status: 400 });

    const withNews = results.filter(r => r.has_news && r.headline);
    const withoutNews = results.filter(r => !r.has_news || !r.headline);

    if (withNews.length === 0) {
      return Response.json({
        selected: [],
        rejected: results.map(r => r.ticker),
        market_theme: "No significant news across portfolio today."
      });
    }

    const prompt = buildCuratorPrompt(withNews, withoutNews);

    try {
      const ai = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });

      const j = await ai.json();
      const text = j.choices?.[0]?.message?.content?.trim();

      if (!text) {
        console.error("Empty curator AI output:", JSON.stringify(j).slice(0, 500));
        return Response.json(fallback(withNews, withoutNews));
      }

      return Response.json(JSON.parse(text));
    } catch (err) {
      console.error("Curator failed:", err.message);
      return Response.json(fallback(withNews, withoutNews));
    }
  },
};

function fallback(withNews, withoutNews) {
  return {
    selected: withNews.map(r => ({
      ticker: r.ticker, date: r.date, headline: r.headline,
      summary: r.summary, sentiment: r.sentiment, magnitude: r.magnitude, sources: r.sources
    })),
    rejected: withoutNews.map(r => r.ticker),
    market_theme: "Curation unavailable — raw results passed through."
  };
}

function buildCuratorPrompt(withNews, withoutNews) {
  const newsBlock = withNews.map(r =>
    `TICKER: ${r.ticker}
DATE: ${r.date}
HEADLINE: ${r.headline}
SUMMARY: ${r.summary}
SENTIMENT: ${r.sentiment} (magnitude: ${r.magnitude})
SOURCES: ${(r.sources || []).join(", ")}`
  ).join("\n\n---\n\n");

  const quietTickers = withoutNews.map(r => r.ticker).join(", ");

  return `
You are a senior portfolio analyst curating today's news for a 25-stock portfolio.

You receive individual news assessments from per-ticker analysts. Your job is to:

1. COMPARE across all tickers and identify what is TRULY important vs noise
2. BALANCE coverage: ensure tickers with less media presence (e.g. PG, KO, HD) get fair representation when they DO have news. Do NOT let mega-cap tickers (AAPL, NVDA, MSFT, TSLA) crowd out others just because they have more media volume.
3. DISTINGUISH genuine importance: "NVIDIA partners with Anthropic for new AI servers" is major bullish. "Apple stock moves 0.5% on normal trading" is NOT news.
4. ASSIGN final sentiment magnitude: -1.0 (max bearish) to +1.0 (max bullish). Be calibrated:
   - ±0.1 to ±0.3: Minor news (analyst note, small partnership)
   - ±0.3 to ±0.6: Moderate news (earnings beat/miss, product launch, upgrade/downgrade)
   - ±0.6 to ±0.9: Major news (M&A, regulatory action, guidance change, executive departure)
   - ±0.9 to ±1.0: Extreme/historic (fraud, bankruptcy, transformative deal)
5. REJECT tickers whose "news" is actually just routine or recycled from previous days

TICKERS WITH NEWS:
${newsBlock}

QUIET TICKERS (no significant news): ${quietTickers || "none"}

Respond in JSON format:
{
  "selected": [
    {
      "ticker": "AAPL",
      "date": "2026-03-11",
      "headline": "...",
      "summary": "...",
      "sentiment": "bullish" or "bearish" or "neutral",
      "magnitude": 0.5,
      "sources": ["url1", "url2"],
      "importance_rank": 1
    }
  ],
  "rejected": ["KO", "PG"],
  "market_theme": "One sentence describing today's overall market narrative"
}

RULES:
- selected array should contain only tickers with genuinely significant news
- importance_rank: 1 = most important, ascending
- You may adjust the magnitude from what the per-ticker analyst assigned if you think it was miscalibrated
- Be honest: if a big-name ticker has trivial news, reject it. If a small ticker has real news, include it.
`.trim();
}
