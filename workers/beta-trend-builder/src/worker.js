export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-trend")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const date = now.slice(0, 10);

    // --------------------------------------------
    // INPUT: latest general synthesis
    // --------------------------------------------
    const gen = await db.prepare(`
      SELECT summary
      FROM BETA_08_Gen_Processed
      ORDER BY date DESC
      LIMIT 1
    `).first();

    // --------------------------------------------
    // INPUT: latest news synthesis
    // --------------------------------------------
    //const news = await db.prepare(`
    //  SELECT summary
    //  FROM BETA_07_News_Processed
    //  ORDER BY date DESC
    //  LIMIT 1
    //`).first();

    // --------------------------------------------
    // INPUT: latest FOMC
    // --------------------------------------------
    const fomc = await db.prepare(`
      SELECT date, summary
      FROM BETA_03_Macro
      WHERE type = 'FOMC'
      ORDER BY date DESC
      LIMIT 1
    `).first();

    const prompt = buildPrompt(
      date,
      gen.summary,
      fomc.date,
      fomc.summary
    );

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
    const id = `trend-${idDate.toISOString().slice(0, 10)}`;

    await db.prepare(`
      INSERT INTO BETA_09_Trend
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

function buildPrompt(date, gen, fomcDate, fomc) {
  return `
You are a macro trend analyst.

DATE: ${date}

Your task is to infer the prevailing market trend
by combining macro regime, and monetary policy.

Focus on persistence, direction, and regime transitions.
No bullet points. One compact analytical narrative.

GENERAL MACRO & SENTIMENT:
${gen}

FOMC (${fomcDate}):
${fomc}
`.trim();
}
