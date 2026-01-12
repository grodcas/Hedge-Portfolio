export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/daily-news")
      return new Response("Not found", { status: 404 });

    const { ticker } = await req.json();
    if (!ticker)
      return new Response("ticker missing", { status: 400 });

    const db = env.DB;
    const T = ticker.toUpperCase();
    //const today = new Date().toISOString().slice(0, 10);
    const today = "2025-12-29";


    // --------------------------------------------
    // NEWS
    // --------------------------------------------
    const news = await db.prepare(`
      SELECT source, title, date, summary
      FROM BETA_01_News
      WHERE date = ?
        AND tickers LIKE ?
    `).bind(today, `%${T}%`).all();

    // --------------------------------------------
    // PRESS
    // --------------------------------------------
    const press = await db.prepare(`
      SELECT date, heading, summary
      FROM ALPHA_03_Press
      WHERE ticker = ? AND date = ?
    `).bind(T, today).all();

    // --------------------------------------------
    // FORM 4 + 8-K (summaries already ensured)
    // --------------------------------------------
    const filings = await db.prepare(`
      SELECT id, type, date, summary
      FROM ALPHA_01_Reports
      WHERE ticker = ?
        AND date = ?
        AND type IN ('4', '8-K')
    `).bind(T, today).all();

    if (
      !news.results.length &&
      !press.results.length &&
      !filings.results.length
    ) {
      return new Response("No daily events", { status: 204 });
    }

    const prompt = buildPrompt(
      T,
      today,
      news.results,
      press.results,
      filings.results
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

    let summary = text;
    let important = "";

    if (text.includes("\n\nIMPORTANT:\n")) {
      [summary, important] = text.split("\n\nIMPORTANT:\n");
    }

    // --------------------------------------------
    // Persist
    // --------------------------------------------
    await db.prepare(`
      INSERT INTO ALPHA_05_Daily_news
        (id, ticker, summary, todays_important, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        todays_important = excluded.todays_important,
        created_at = excluded.created_at
    `).bind(
      crypto.randomUUID(),
      T,
      summary.trim(),
      important.trim(),
      new Date().toISOString()
    ).run();

    return Response.json({ ok: true, ticker: T });
  },
};

function buildPrompt(ticker, date, news, press, filings) {
  return `
You are an equity analyst.

TODAY: ${date}
TICKER: ${ticker}

You MUST explicitly summarize ALL filings listed below
(Form 4 and 8-K), even if you judge them low alpha.

OUTPUT FORMAT (strict):

SUMMARY:
(~2000 chars)

IMPORTANT:
(200–400 chars, MUST NOT be empty)

NEWS:
${news.map(n =>
  `• [${n.date}] ${n.source} – ${n.title}\n${n.summary}`
).join("\n\n")}

PRESS RELEASES:
${press.map(p =>
  `• [${p.date}] ${p.heading}\n${p.summary}`
).join("\n\n")}

FILINGS:
${filings.map(f =>
  `• [${f.date}] ${f.type}\n${f.summary || "Summary not available"}`
).join("\n\n")}
`.trim();
}
