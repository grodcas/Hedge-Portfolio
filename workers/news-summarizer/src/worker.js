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
    const today = "2026-02-05"; // TESTING: hardcoded date


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
      return new Response(null, { status: 204 });
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
    // Determine LAST_IMPORTANT
    // --------------------------------------------
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const isMonday = dayOfWeek === 1;

    let lastImportant = important.trim();
    let lastImportantDate = today;

    if (!isMonday) {
      // Fetch the latest row for this ticker
      const prevRow = await db.prepare(`
        SELECT last_important, last_important_date
        FROM ALPHA_05_Daily_news
        WHERE ticker = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(T).first();

      if (prevRow && prevRow.last_important) {
        // Call AI to compare today's important vs previous last_important
        const comparePrompt = buildComparePrompt(
          today,
          important.trim(),
          prevRow.last_important,
          prevRow.last_important_date
        );

        const compareAi = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: comparePrompt }],
            temperature: 0,
          }),
        });

        const compareJ = await compareAi.json();
        const decision = compareJ.choices?.[0]?.message?.content?.trim().toUpperCase();

        // If AI says keep the previous one, use the previous values
        if (decision === "PREVIOUS") {
          lastImportant = prevRow.last_important;
          lastImportantDate = prevRow.last_important_date;
        }
        // Otherwise keep today's (default)
      }
    }

    // --------------------------------------------
    // Check for new SEC filings (10-Q or 10-K from today or yesterday)
    // --------------------------------------------
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const { results: secFilings } = await db.prepare(`
      SELECT id
      FROM ALPHA_01_Reports
      WHERE ticker = ?
        AND type IN ('10-Q', '10-K')
        AND date IN (?, ?)
    `).bind(T, today, yesterday).all();

    const newSec = JSON.stringify(secFilings.map(f => f.id));

    // --------------------------------------------
    // Persist (one entry per ticker per week)
    // --------------------------------------------
    const idDate = new Date();
    if (!isMonday) {
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days back
      idDate.setDate(idDate.getDate() - daysBack);
    }
    const id = `${T}-${idDate.toISOString().slice(0, 10)}`;

    await db.prepare(`
      INSERT INTO ALPHA_05_Daily_news
        (id, ticker, summary, todays_important, last_important, last_important_date, new_sec, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        todays_important = excluded.todays_important,
        last_important = excluded.last_important,
        last_important_date = excluded.last_important_date,
        new_sec = excluded.new_sec,
        created_at = excluded.created_at
    `).bind(
      id,
      T,
      summary.trim(),
      important.trim(),
      lastImportant,
      lastImportantDate,
      newSec,
      new Date().toISOString()
    ).run();

    // --------------------------------------------
    // Queue trend-orchestrator if new SEC filings found
    // --------------------------------------------
    if (secFilings.length > 0) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        new Date().toISOString(),
        "trend-orchestrator",
        JSON.stringify({ ticker: T }),
        "pending"
      ).run();
    }

    return Response.json({ ok: true, ticker: T, trendQueued: secFilings.length > 0 });
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

function buildComparePrompt(today, todayImportant, prevImportant, prevDate) {
  return `
You are an equity analyst comparing two important market events.

TODAY'S DATE: ${today}

TODAY'S IMPORTANT EVENT:
${todayImportant}

PREVIOUS IMPORTANT EVENT (from ${prevDate}):
${prevImportant}

Which event is MORE RELEVANT for an investor to know about?
Consider: market impact, materiality, recency, and alpha potential.

Reply with ONLY one word:
- "TODAY" if today's event is more relevant
- "PREVIOUS" if the previous event is more relevant
`.trim();
}
