export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/search-news")
      return new Response("Not found", { status: 404 });

    const { ticker } = await req.json();
    if (!ticker)
      return new Response("ticker missing", { status: 400 });

    const db = env.DB;
    const T = ticker.toUpperCase();
    const today = new Date().toISOString().slice(0, 10);

    // Fetch previous summary for context
    const prevRow = await db.prepare(`
      SELECT summary FROM ALPHA_05_Daily_news
      WHERE ticker = ? ORDER BY created_at DESC LIMIT 1
    `).bind(T).first();

    const prompt = buildSearchPrompt(T, today, prevRow?.summary || null);

    try {
      const ai = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          tools: [{ type: "web_search_preview" }],
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "ticker_news",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  ticker: { type: "string" },
                  has_news: { type: "boolean" },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  headline: { type: "string" },
                  summary: { type: "string", description: "200-400 chars" },
                  sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                  magnitude: { type: "number", description: "-1.0 to +1.0" },
                  sources: { type: "array", items: { type: "string" } }
                },
                required: ["ticker", "has_news", "date", "headline", "summary", "sentiment", "magnitude", "sources"],
                additionalProperties: false
              }
            }
          }
        }),
      });

      const j = await ai.json();

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
        console.error(`Empty AI output for ${T}:`, JSON.stringify(j).slice(0, 500));
        return Response.json({ ticker: T, has_news: false, date: today, headline: "", summary: "", sentiment: "neutral", magnitude: 0, sources: [] });
      }

      const result = JSON.parse(text);
      result.ticker = T;
      return Response.json(result);
    } catch (err) {
      console.error(`Search failed for ${T}:`, err.message);
      return Response.json({ ticker: T, has_news: false, date: today, headline: "", summary: "", sentiment: "neutral", magnitude: 0, sources: [] });
    }
  },
};

function buildSearchPrompt(ticker, today, previousSummary) {
  const prevContext = previousSummary
    ? `\n\nPREVIOUS DAY'S SUMMARY (use this to distinguish NEW news from OLD):\n${previousSummary}`
    : "\n\nNo previous summary available — all news is potentially new.";

  return `
You are a financial news analyst. Search the internet for the most important and talked-about news about ${ticker} stock.

TODAY'S DATE: ${today}

YOUR TASK:
1. Search for the most recent and significant news about ${ticker}
2. Find what is THE MOST talked about regarding this ticker right now
3. Determine the EXACT DATE the news event happened or was published
4. Assess whether the news is BULLISH or BEARISH for the stock
5. Score the magnitude: -1.0 = maximally bearish, +1.0 = maximally bullish, 0 = neutral

CRITICAL RULES:
- THE DATE IS THE MOST IMPORTANT FIELD. Get the exact date right. If the news is from today (${today}), say so. If it's from yesterday or earlier, report the ACTUAL date.
- Only report genuinely significant news. Examples of significant: earnings surprises, product launches, M&A, analyst upgrades/downgrades, regulatory actions, executive changes, major partnerships, lawsuits, guidance changes.
- If there is NO significant news about ${ticker} today or recently, set has_news to false and leave other fields empty.
- Do NOT force or invent news. If the ticker is quiet, it is quiet.
- The sentiment and magnitude should reflect INVESTOR IMPACT, not just whether the news sounds positive. Example: "New iPhone launched but reviews say it's identical to last year" = bearish despite being a product launch.
${prevContext}

Respond in the required JSON format.
`.trim();
}
