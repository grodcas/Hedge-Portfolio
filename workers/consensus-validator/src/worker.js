/**
 * CONSENSUS VALIDATOR — Layer 3.5
 *
 * Validates our pipeline's short-term ticker trends against EXTERNAL market
 * consensus using Gemini 2.5-flash with Google Search grounding. Runs only
 * for tickers whose TICKER_TREND_short fired today — cheap, targeted, and
 * synchronised with where conviction actually shifted.
 *
 * NOTE ON MODEL CHOICE: the portfolio v2 spec says "all gpt-5" but this
 * worker is the explicit exception. Its value comes from GROUNDING in live
 * external sources via google_search, which gpt-5 does not expose natively.
 * We keep Gemini here because an "internal second-opinion LLM" is not the
 * same product as "what does the outside world actually say" — the latter
 * is what this worker exists to deliver.
 *
 * ANTI-CONFIRMATION-BIAS design:
 *   1. Neutral search: "What is the outlook for X?" (NOT "Why is X bullish?")
 *   2. Opposing search: Actively look for counter-arguments
 *   3. Measure consensus WEIGHT, not just existence
 *   4. Flag any conclusions where we might have missed the dominant narrative
 *
 * Budget: usually 0-5 calls/day (only tickers where trend-short fired).
 */

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/validate-consensus")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "GEMINI_API_KEY not set" }, { status: 500 });
    }

    console.log(`[CONSENSUS] Starting for ${today}`);

    // Load tickers whose short-term trend fired today. This is the ONLY
    // trigger for running consensus — it matches the "verify what just
    // shifted" role of this worker.
    const { results: firedTrends } = await db.prepare(`
      SELECT ticker, regime, score, thesis, trigger, trigger_detail
        FROM TICKER_TREND_short
       WHERE as_of = ?
       ORDER BY ABS(score) DESC
    `).bind(today).all();

    // Load today's macro intelligence — still validate it daily (macro
    // recommendation is load-bearing for operations agent in session 3).
    const macroRow = await db.prepare(`
      SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1
    `).first();

    let macroConclusion = null;
    try {
      if (macroRow?.summary?.startsWith("{")) {
        const intel = JSON.parse(macroRow.summary);
        const trend = intel.trend || intel; // v2/v3 both supported
        macroConclusion = {
          regime: trend.regime,
          direction: trend.sp500_direction,
        };
      }
    } catch {}

    // Build validation tasks
    const tasks = [];
    for (const t of (firedTrends || [])) {
      tasks.push({
        target: t.ticker,
        type: "ticker",
        score: t.score,
        conclusion: `${t.regime} (score ${t.score?.toFixed?.(2) ?? t.score}) — ${t.thesis || ""}  [fired: ${t.trigger}]`,
      });
    }
    if (macroConclusion) {
      tasks.push({
        target: "MARKET",
        type: "macro",
        score: macroConclusion.direction?.p_up > 0.5 ? 0.5 : macroConclusion.direction?.p_down > 0.5 ? -0.5 : 0,
        conclusion: `Market regime: ${macroConclusion.regime}. P(up)=${macroConclusion.direction?.p_up?.toFixed(2)}, P(down)=${macroConclusion.direction?.p_down?.toFixed(2)}`,
      });
    }

    console.log(`[CONSENSUS] Validating ${tasks.length} conclusions (${firedTrends?.length || 0} fired ticker trends + ${macroConclusion ? 1 : 0} macro)`);

    if (tasks.length === 0) {
      return Response.json({ ok: true, date: today, validated: 0, note: "no fired trends today" });
    }

    // Run Gemini validations in parallel (6 calls, safe for rate limits)
    const results = await Promise.allSettled(
      tasks.map(t => validateWithGemini(t, apiKey, today))
    );

    const consensusResults = [];
    for (let i = 0; i < results.length; i++) {
      const task = tasks[i];
      if (results[i].status === "fulfilled" && results[i].value) {
        consensusResults.push(results[i].value);
      } else {
        console.error(`[CONSENSUS] Failed for ${task.target}:`, results[i].reason?.message);
      }
    }

    // POST to ingestor
    if (consensusResults.length > 0) {
      try {
        const res = await fetch(`${INGESTOR_URL}/ingest/consensus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(consensusResults),
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[CONSENSUS] Ingested ${data.inserted} results`);
        }
      } catch (err) {
        console.error(`[CONSENSUS] Ingest failed: ${err.message}`);
      }
    }

    return Response.json({
      ok: true,
      date: today,
      validated: consensusResults.length,
      results: consensusResults.map(r => ({
        target: r.target,
        confidence: r.confidence,
        consensus_level: r.consensus_level,
      })),
    });
  },
};

async function validateWithGemini(task, apiKey, today) {
  const direction = task.score > 0 ? "bullish" : task.score < 0 ? "bearish" : "neutral";
  const opposing = direction === "bullish" ? "risks and bearish arguments"
                 : direction === "bearish" ? "bullish arguments and opportunities"
                 : "both bullish and bearish arguments";

  // CRITICAL: Neutral search phrasing, NOT confirmation
  const targetLabel = task.type === "macro" ? "the US stock market (S&P 500)" : `${task.target} stock`;

  const prompt = `You are a market consensus checker. You are NOT generating investment advice. Your job is to report what the market thinks.

TASK 1 (NEUTRAL): What is the general market outlook for ${targetLabel} this week? What are analysts and investors saying? Find the DOMINANT narrative.

TASK 2 (OPPOSING): What are the strongest ${opposing} for ${targetLabel} right now? Actively search for the counter-view.

OUR PIPELINE CONCLUSION (for context, do NOT search for this):
"${task.conclusion}"

After searching, answer as JSON ONLY (no prose, no markdown):
{
  "dominant_narrative": "one sentence: what most sources say about ${targetLabel}",
  "consensus_direction": "bullish" | "bearish" | "mixed",
  "consensus_level": 0.0 to 1.0 (fraction of sources aligned with our ${direction} view),
  "missed_factors": ["short description of factors the pipeline may have missed"],
  "strongest_counter": "the single strongest argument against the ${direction} view",
  "sources": ["source names found"]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  // Extract grounding metadata (search sources) if present
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = groundingChunks
    .map(c => c.web?.title || c.web?.uri)
    .filter(Boolean)
    .slice(0, 10);

  // Try JSON parse first (handles cases where Gemini actually outputs JSON)
  const cleanedText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch { /* fall through to prose fallback */ }
  }

  if (parsed) {
    // Structured path — exactly what we asked for
    const level = parseFloat(parsed.consensus_level) || 0;
    const missedFactors = parsed.missed_factors || [];
    let confidence;
    if (level >= 0.7 && missedFactors.length === 0) confidence = "HIGH";
    else if (level >= 0.4) confidence = "MEDIUM";
    else confidence = "LOW";

    return {
      date: today,
      target: task.target,
      our_conclusion: task.conclusion,
      dominant_narrative: parsed.dominant_narrative || "",
      consensus_level: level,
      missed_factors: JSON.stringify(missedFactors),
      strongest_counter: parsed.strongest_counter || "",
      confidence,
      search_sources: JSON.stringify(parsed.sources || sources),
    };
  }

  // PROSE FALLBACK: Gemini with google_search often returns grounded prose.
  // Don't fail — extract what we can from the text itself.
  const prose = text.trim();
  const firstSentence = prose.split(/[.!?]\s+/)[0]?.slice(0, 300) || prose.slice(0, 300);

  // Simple sentiment heuristic from the text
  const lower = prose.toLowerCase();
  const bullishHits = (lower.match(/\b(bullish|upside|positive|beat|growth|strong|rally|gain)\b/g) || []).length;
  const bearishHits = (lower.match(/\b(bearish|downside|weak|miss|decline|concern|risk|drop|fall)\b/g) || []).length;
  const totalHits = bullishHits + bearishHits;

  // Estimate consensus alignment with our direction
  let consensusLevel = 0.5;
  if (totalHits > 0) {
    const bullishRatio = bullishHits / totalHits;
    if (direction === "bullish") consensusLevel = bullishRatio;
    else if (direction === "bearish") consensusLevel = 1 - bullishRatio;
  }

  return {
    date: today,
    target: task.target,
    our_conclusion: task.conclusion,
    dominant_narrative: firstSentence,
    consensus_level: consensusLevel,
    missed_factors: "[]",
    strongest_counter: prose.slice(0, 500),
    confidence: "MEDIUM",
    search_sources: JSON.stringify(sources),
  };
}
