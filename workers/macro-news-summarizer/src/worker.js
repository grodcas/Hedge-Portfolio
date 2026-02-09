export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-news")
      return new Response("Not found", { status: 404 });

    const { date } = await req.json();
    if (!date)
      return new Response("date missing", { status: 400 });

    const db = env.DB;
    const now = new Date().toISOString();

    // --------------------------------------------
    // INPUT: market news
    // --------------------------------------------
    const { results: news } = await db.prepare(`
      SELECT source, title, summary
      FROM BETA_01_News
      WHERE date = ?
    `).bind(date).all();

    // --------------------------------------------
    // INPUT: White House news
    // --------------------------------------------
    const { results: wh } = await db.prepare(`
      SELECT title, summary
      FROM BETA_02_WH
      WHERE date = ?
    `).bind(date).all();

    if (!news.length && !wh.length)
      return new Response(null, { status: 204 });

    const prompt = buildPrompt(date, news, wh);

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
    const hashInput = `${date}|news`;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(hashInput)
    );
    const id = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    await db.prepare(`
      INSERT INTO BETA_07_News_Processed
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

function buildPrompt(date, news, wh) {
  return `
You are a macro news analyst.

DATE: ${date}

Your task is to synthesize the following news into a single
coherent daily news narrative.

Focus on dominant themes, policy signals, and market relevance.
No bullet points. One compact analytical narrative.

MARKET NEWS:
${news.map(n =>
  `• ${n.source} – ${n.title}\n${n.summary}`
).join("\n\n")}

WHITE HOUSE:
${wh.map(w =>
  `• ${w.title}\n${w.summary}`
).join("\n\n")}
`.trim();
}
