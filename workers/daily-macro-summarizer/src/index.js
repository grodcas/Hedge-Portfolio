export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-daily-macro")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    // --------------------------------------------
    // Fetch macro indicators from today or yesterday
    // --------------------------------------------
    const { results: macroResults } = await db.prepare(`
      SELECT id, type, summary, date
      FROM BETA_03_Macro
      WHERE date IN (?, ?)
    `).bind(today, yesterday).all();

    // --------------------------------------------
    // Fetch sentiment indicators from today or yesterday
    // --------------------------------------------
    const { results: sentimentResults } = await db.prepare(`
      SELECT id, type, summary, date
      FROM BETA_04_Sentiment
      WHERE date IN (?, ?)
    `).bind(today, yesterday).all();

    // If no data found, return early
    if (!macroResults.length && !sentimentResults.length) {
      return new Response(null, { status: 204 });
    }

    // --------------------------------------------
    // Build structure array
    // --------------------------------------------
    const structure = [];
    const summaries = [];

    for (const m of macroResults) {
      structure.push({
        Table: "BETA_03_Macro",
        Type: m.type,
        id: m.id
      });
      summaries.push({
        type: m.type,
        table: "BETA_03_Macro",
        date: m.date,
        summary: m.summary
      });
    }

    for (const s of sentimentResults) {
      structure.push({
        Table: "BETA_04_Sentiment",
        Type: s.type,
        id: s.id
      });
      summaries.push({
        type: s.type,
        table: "BETA_04_Sentiment",
        date: s.date,
        summary: s.summary
      });
    }

    // --------------------------------------------
    // Build AI prompt
    // --------------------------------------------
    const prompt = buildPrompt(today, summaries);

    // --------------------------------------------
    // AI call
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
    // Persist to BETA_10_Daily_macro
    // --------------------------------------------
    const id = `daily-macro-${today}`;

    await db.prepare(`
      INSERT INTO BETA_10_Daily_macro
        (id, structure, summary, creation_date)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        structure = excluded.structure,
        summary = excluded.summary,
        creation_date = excluded.creation_date
    `).bind(
      id,
      JSON.stringify(structure),
      text,
      now.toISOString()
    ).run();

    return Response.json({
      ok: true,
      date: today,
      indicatorsFound: structure.length
    });
  },
};

function buildPrompt(date, summaries) {
  return `
You are a macroeconomic analyst.

DATE: ${date}

Your task is to synthesize the following macro and sentiment indicators
that were updated today or yesterday into a comprehensive daily macro summary.

Focus on:
- Key changes in economic indicators
- Market sentiment shifts
- Directional implications for markets
- Any notable divergences or convergences

Write a cohesive analytical narrative of approximately 3000 characters.
No bullet points. One flowing analytical piece.

INDICATORS:
${summaries.map(s =>
  `[${s.table}] ${s.type} (${s.date}):\n${s.summary}`
).join("\n\n")}
`.trim();
}
