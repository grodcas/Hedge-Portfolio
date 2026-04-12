/**
 * CONSENSUS VALIDATOR — Layer 3.5
 *
 * Validates our pipeline's conclusions against market consensus using
 * Gemini 2.5-flash with Google Search grounding.
 *
 * ANTI-CONFIRMATION-BIAS design:
 *   1. Neutral search: "What is the outlook for X?" (NOT "Why is X bullish?")
 *   2. Opposing search: Actively look for counter-arguments
 *   3. Measure consensus WEIGHT, not just existence
 *   4. Flag any conclusions where we might have missed the dominant narrative
 *
 * Budget: ~6 Gemini calls/day (top 5 strongest signals + 1 macro).
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

    // Load top 5 strongest assessments (by abs(score))
    const { results: assessments } = await db.prepare(`
      SELECT ticker, score, explanation FROM SIGNAL_01_Assessment
      WHERE date = ?
      ORDER BY ABS(score) DESC
      LIMIT 5
    `).bind(today).all();

    // Load today's macro intelligence
    const macroRow = await db.prepare(`
      SELECT summary FROM BETA_10_Daily_macro ORDER BY creation_date DESC LIMIT 1
    `).first();

    let macroConclusion = null;
    try {
      if (macroRow?.summary?.startsWith("{")) {
        const intel = JSON.parse(macroRow.summary);
        macroConclusion = {
          regime: intel.regime,
          direction: intel.sp500_direction,
          whats_next: intel.whats_next,
        };
      }
    } catch {}

    // Build validation tasks
    const tasks = [];
    for (const a of (assessments || [])) {
      tasks.push({
        target: a.ticker,
        type: "ticker",
        score: a.score,
        conclusion: a.explanation || `Score: ${a.score}`,
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

    console.log(`[CONSENSUS] Validating ${tasks.length} conclusions`);

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

  // Extract JSON (Gemini may wrap in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }

  // Determine confidence
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
    search_sources: JSON.stringify(parsed.sources || []),
  };
}
