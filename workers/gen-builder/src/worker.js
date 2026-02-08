export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-gen")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const date = now.slice(0, 10);

    // --------------------------------------------
    // INPUT: latest sentiment
    // --------------------------------------------
    const sentiment = await db.prepare(`
      SELECT summary
      FROM BETA_06_Sentiment_Processed
      ORDER BY date DESC
      LIMIT 1
    `).first();

    // --------------------------------------------
    // INPUT: latest macro
    // --------------------------------------------
    const macro = await db.prepare(`
      SELECT summary
      FROM BETA_05_Macro_Processed
      ORDER BY date DESC
      LIMIT 1
    `).first();

    const prompt = buildPrompt(date, sentiment.summary, macro.summary);

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
    // Persist (one entry per week, override Mon-Fri)
    // --------------------------------------------
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const isMonday = dayOfWeek === 1;
    const idDate = new Date();
    if (!isMonday) {
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      idDate.setDate(idDate.getDate() - daysBack);
    }
    const id = `gen-${idDate.toISOString().slice(0, 10)}`;

    await db.prepare(`
      INSERT INTO BETA_08_Gen_Processed
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

function buildPrompt(date, sentiment, macro) {
  return `
You are a macro strategist.

DATE: ${date}

Your task is to synthesize macro conditions and market sentiment
into a single high-level assessment.

Focus on regime, risks, and directional implications.
No bullet points. One compact analytical narrative.

SENTIMENT:
${sentiment}

MACRO:
${macro}
`.trim();
}
