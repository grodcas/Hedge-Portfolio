export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/curate-macro")
      return new Response("Not found", { status: 404 });

    const { layers, today } = await req.json();
    if (!Array.isArray(layers))
      return new Response("layers array missing", { status: 400 });

    const prompt = buildCuratorPrompt(layers, today);

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

      if (!ai.ok) {
        const errBody = await ai.text();
        console.error(`Macro curator API error (${ai.status}): ${errBody.slice(0, 500)}`);
        return Response.json(fallback(layers));
      }

      const j = await ai.json();
      const text = j.choices?.[0]?.message?.content?.trim();

      if (!text) {
        console.error("Empty macro curator output:", JSON.stringify(j).slice(0, 500));
        return Response.json(fallback(layers));
      }

      return Response.json(JSON.parse(text));
    } catch (err) {
      console.error("Macro curator failed:", err.message);
      return Response.json(fallback(layers));
    }
  },
};

function fallback(layers) {
  const allEvents = layers.flatMap(l => (l.events || []).map(e => `[${l.layer}] ${e.headline}`));
  return {
    summary: allEvents.join("\n") || "No macro data available.",
    overall_sentiment: "neutral",
    overall_magnitude: 0,
    sector_sentiments: {},
    top_stories: []
  };
}

function buildCuratorPrompt(layers, today) {
  const layerBlocks = layers.map(l => {
    const events = (l.events || []).map(e =>
      `  ${e.id}: [${e.date}] ${e.headline}\n    ${e.summary}\n    Sentiment: ${e.sentiment} (${e.magnitude}) | Confidence: ${e.confidence} | Sources: ${(e.sources || []).join(", ")}`
    ).join("\n\n");

    return `=== LAYER: ${l.layer.toUpperCase()} ===
Layer sentiment: ${l.sentiment} (${l.magnitude})
${events || "  No events found."}`;
  }).join("\n\n");

  return `
You are a senior macro strategist synthesizing 5 intelligence layers into a unified daily market brief.

TODAY: ${today}

${layerBlocks}

YOUR TASK:
1. SYNTHESIZE all 5 layers into a coherent ~1500 char analytical narrative.
2. CROSS-VALIDATE: if two layers report conflicting signals (e.g., calendar says dovish CPI but geopolitics says risk-off), address the tension explicitly.
3. Assign OVERALL MARKET SENTIMENT: -1.0 (max bearish) to +1.0 (max bullish).
4. Assign PER-SECTOR SENTIMENTS for: tech, financials, energy, healthcare, consumer, industrials.
5. Rank TOP 3 stories by market impact across all layers.
6. Flag any events with "low" confidence — these need verification.

CALIBRATION:
- ±0.1 to ±0.3: Quiet day, minor data, routine geopolitics
- ±0.3 to ±0.5: Notable data surprise OR meaningful policy shift
- ±0.5 to ±0.7: Major data miss/beat, significant geopolitical escalation, regulatory shock
- ±0.7 to ±1.0: Crisis-level event (war escalation, financial stress, emergency Fed action)

Respond in JSON:
{
  "summary": "Unified analytical narrative (~1500 chars)...",
  "overall_sentiment": "bullish" or "bearish" or "neutral",
  "overall_magnitude": 0.3,
  "sector_sentiments": {
    "tech": { "sentiment": "bullish", "magnitude": 0.4 },
    "financials": { "sentiment": "neutral", "magnitude": 0.0 },
    "energy": { "sentiment": "bearish", "magnitude": -0.3 },
    "healthcare": { "sentiment": "bullish", "magnitude": 0.5 },
    "consumer": { "sentiment": "neutral", "magnitude": -0.1 },
    "industrials": { "sentiment": "bullish", "magnitude": 0.2 }
  },
  "top_stories": [
    { "rank": 1, "layer": "economic_calendar", "headline": "...", "magnitude": 0.5 },
    { "rank": 2, "layer": "geopolitics", "headline": "...", "magnitude": -0.4 },
    { "rank": 3, "layer": "the_wave", "headline": "...", "magnitude": 0.3 }
  ],
  "low_confidence_flags": ["Event X from layer Y needs verification"]
}
`.trim();
}
