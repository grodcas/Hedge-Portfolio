/**
 * MACRO INTELLIGENCE BUILDER
 *
 * Synthesizes BETA_03 (macro) + BETA_04 (sentiment) + BETA_11 (5-layer news)
 * + BETA_12 (macro headlines) into a STRUCTURED JSON with:
 *   - regime
 *   - sp500_direction probabilities
 *   - what_happened / whats_next / portfolio_action
 *   - 5-layer intelligence scores
 *
 * Uses GPT-4o-mini with response_format: json_object, temperature 0.
 * Prompt is VERY specific — no open-ended questions, strict schema.
 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build-macro-intelligence")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    console.log(`[MACRO INTEL] Starting for ${today}`);

    // Load inputs
    const [macroRows, sentRows, macroNewsRow, newsDigestRows] = await Promise.all([
      db.prepare(`SELECT type, date, summary FROM BETA_03_Macro ORDER BY date DESC LIMIT 20`).all(),
      db.prepare(`SELECT type, date, summary FROM BETA_04_Sentiment ORDER BY date DESC LIMIT 10`).all(),
      db.prepare(`SELECT * FROM BETA_11_Macro_news ORDER BY created_at DESC LIMIT 1`).first(),
      db.prepare(`SELECT title, summary, category, sentiment, magnitude FROM BETA_12_News_digest WHERE date = ? AND type = 'macro' ORDER BY rank LIMIT 10`).bind(today).all(),
    ]);

    // Build compact input for the LLM
    const macroData = (macroRows.results || []).slice(0, 8).map(r => {
      let parsed;
      try { parsed = JSON.parse(r.summary || "{}"); } catch { parsed = {}; }
      return `- ${r.type} (${r.date}): ${parsed.text || parsed.summary || r.summary?.slice(0, 100) || "no data"}`;
    }).join("\n");

    const sentData = (sentRows.results || []).slice(0, 5).map(r => {
      let parsed;
      try { parsed = JSON.parse(r.summary || "{}"); } catch { parsed = {}; }
      return `- ${r.type}: ${parsed.text || parsed.value || r.summary?.slice(0, 80) || "no data"}`;
    }).join("\n");

    const macroNews = (newsDigestRows.results || []).map(n =>
      `- [${n.category}] ${n.title} (${n.sentiment}, ${n.magnitude})`
    ).join("\n");

    // Parse 5-layer news if available
    let layersContext = "";
    if (macroNewsRow) {
      try {
        const layers = {
          calendar: JSON.parse(macroNewsRow.layer_calendar || "{}"),
          geopolitics: JSON.parse(macroNewsRow.layer_geopolitics || "{}"),
          regulatory: JSON.parse(macroNewsRow.layer_regulatory || "{}"),
          sectors: JSON.parse(macroNewsRow.layer_sectors || "{}"),
          wave: JSON.parse(macroNewsRow.layer_wave || "{}"),
        };
        layersContext = Object.entries(layers).map(([k, v]) =>
          `${k}: sentiment=${v.sentiment}, magnitude=${v.magnitude}, events=${(v.events || []).length}`
        ).join("\n");
      } catch {}
    }

    const prompt = `You are a macro analyst. Output JSON ONLY. No commentary, no markdown.

INPUT DATA
==========
Recent macro indicators:
${macroData || "No data"}

Sentiment indicators:
${sentData || "No data"}

5-layer news intelligence:
${layersContext || "No data"}

Top macro headlines today:
${macroNews || "No data"}

TASK
====
Produce this EXACT JSON structure. Do not invent numbers not grounded in the input.

{
  "regime": "bullish" | "cautious_bullish" | "neutral" | "cautious_bearish" | "bearish",
  "sp500_direction": {"p_up": 0.55, "p_flat": 0.30, "p_down": 0.15},
  "what_happened": ["3-5 short bullets describing what moved markets recently"],
  "whats_next": ["3-5 short bullets about upcoming catalysts"],
  "portfolio_action": {
    "overweight": ["sector names"],
    "underweight": ["sector names"],
    "hedge": "one sentence hedge suggestion"
  },
  "five_layers": {
    "calendar": {"score": 1-5, "summary": "one sentence"},
    "geopolitics": {"score": 1-5, "summary": "one sentence"},
    "regulatory": {"score": 1-5, "summary": "one sentence"},
    "sectors": {"score": 1-5, "summary": "one sentence"},
    "wave": {"score": 1-5, "summary": "one sentence"}
  }
}

RULES:
- p_up + p_flat + p_down must equal 1.0
- Sectors must be from: Technology, Finance, Energy, Healthcare, Consumer, Industrial
- Base conclusions ONLY on the input data
- If input is empty/missing, use "neutral" regime and 0.33/0.34/0.33 probabilities
- Do not mention Anthropic, AI companies, or make up events not in the input`;

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    let intel;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
      });

      const j = await res.json();
      const text = j.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty AI output");
      intel = JSON.parse(text);
    } catch (err) {
      console.error(`[MACRO INTEL] AI failed: ${err.message}`);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }

    // Validate structure
    if (!intel.regime || !intel.sp500_direction || !intel.what_happened) {
      return Response.json({ ok: false, error: "Invalid JSON structure from AI", intel }, { status: 500 });
    }

    // Normalize probabilities (in case AI math is slightly off)
    const dir = intel.sp500_direction;
    const total = (dir.p_up || 0) + (dir.p_flat || 0) + (dir.p_down || 0);
    if (total > 0) {
      dir.p_up = dir.p_up / total;
      dir.p_flat = dir.p_flat / total;
      dir.p_down = dir.p_down / total;
    }

    // Write to BETA_10_Daily_macro (reuse existing table)
    const id = await shortHash(`daily-macro|${today}`);
    const structure = [
      { type: "macro", count: (macroRows.results || []).length },
      { type: "sentiment", count: (sentRows.results || []).length },
      { type: "news_digest", count: (newsDigestRows.results || []).length },
      { type: "five_layers", present: !!macroNewsRow },
    ];

    await db.prepare(`
      INSERT INTO BETA_10_Daily_macro (id, structure, summary, creation_date)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        structure = excluded.structure,
        summary = excluded.summary,
        creation_date = excluded.creation_date
    `).bind(id, JSON.stringify(structure), JSON.stringify(intel), today).run();

    console.log(`[MACRO INTEL] Built intelligence for ${today}, regime=${intel.regime}`);

    return Response.json({
      ok: true,
      date: today,
      regime: intel.regime,
      sp500_direction: intel.sp500_direction,
      layers_count: Object.keys(intel.five_layers || {}).length,
    });
  },
};

async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
