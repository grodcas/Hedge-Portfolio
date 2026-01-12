export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-sentiment")
      return new Response("Not found", { status: 404 });

    const { date } = await req.json();
    if (!date)
      return new Response("date missing", { status: 400 });

    const db = env.DB;
    const now = new Date().toISOString();

    // --------------------------------------------
    // INPUT: MACRO sentiment components
    // --------------------------------------------
    const { results: macro } = await db.prepare(`
    SELECT type, summary, MAX(date) FROM BETA_03_Macro
    WHERE type IN ('Consumer Sentiment', 'Gamma Regime (VIX9D / VIX / VIX3M)')
    GROUP BY type
  `).all();

    // --------------------------------------------
    // INPUT: MARKET sentiment components
    // --------------------------------------------
    const { results: sentiment } = await db.prepare(`
    SELECT type, summary, MAX(date) FROM BETA_04_Sentiment
    WHERE type IN ('PUT_CALL_RATIO', 'AAII_SENTIMENT', 'COT_FUTURES')
    GROUP BY type
  `).all();

  if (!macro.length && !sentiment.length) {
    return Response.json({ ok: false, message: "No data found" }, { status: 200 });
  }

    const prompt = buildPrompt(date, macro, sentiment);

    // --------------------------------------------
    // AI
    // --------------------------------------------
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
      }),
    });

    const j = await ai.json();
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text)
      return new Response("Empty AI output", { status: 502 });

    // --------------------------------------------
    // Persist
    // --------------------------------------------
    const hashInput = `${date}|sentiment`;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(hashInput)
    );
    const id = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    await db.prepare(`
      INSERT INTO BETA_06_Sentiment_Processed
        (id, date, summary, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        created_at = excluded.created_at
    `).bind(
      id,
      date,
      text,
      now
    ).run();

    return Response.json({ ok: true, date });
  },
};

function buildPrompt(date, macro, sentiment) {
  return `
You are a market sentiment analyst.

DATE: ${date}

Your task is to synthesize macro sentiment and market positioning
into a single coherent sentiment assessment.

Focus on risk appetite, positioning, asymmetries, and regime.
No bullet points. One compact analytical narrative.

MACRO SENTIMENT:
${macro.map(m =>
  `• ${m.type}\n${m.summary}`
).join("\n\n")}

MARKET SENTIMENT:
${sentiment.map(s =>
  `• ${s.type}\n${s.summary}`
).join("\n\n")}
`.trim();
}
