export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build-trend")
      return new Response("Not found", { status: 404 });

    const { ticker } = await req.json();
    if (!ticker)
      return new Response("ticker missing", { status: 400 });

    const db = env.DB;
    const T = ticker.toUpperCase();

    // ------------------------------------------------
    // 1) Fetch last 10-K or 10-Q
    // ------------------------------------------------
    // 1) Fetch 4 latest 10-K or 10-Q (Matches Orchestrator exactly)
    const { results: picked } = await db.prepare(`
      SELECT id, type, date, summary
      FROM ALPHA_01_Reports
      WHERE ticker = ? 
        AND type IN ('10-K', '10-Q')
      ORDER BY date DESC
      LIMIT 4
    `).bind(T).all();

    if (picked.length < 4)
      return new Response(`Not enough reports for ${T}`, { status: 409 });

    // 2) Sort chronologically so the AI sees the trend from oldest to newest
    picked.sort((a, b) => a.date.localeCompare(b.date));

    // ------------------------------------------------
    // 3) Build prompt (UNCHANGED LOGIC)
    // ------------------------------------------------
    const blocks = picked.map((r, i) => `
REPORT ${i + 1}
Type: ${r.type}
Date: ${r.date}
Summary:
${r.summary}
    `.trim()).join("\n\n---\n\n");

    const prompt = `
You are an investing analyst. Build a ONE-YEAR trend narrative for ticker ${T}
using ONLY the report summaries provided.

Rules:
- No invented facts
- Anchor trends to dates
- Explain direction over time

Structure:
1) Timeline
2) Operating trend
3) Profitability trend
4) Balance sheet + cash flow
5) Risks
6) Alpha takeaways

REPORT SUMMARIES:
${blocks}
    `.trim();

    // ------------------------------------------------
    // 4) AI call
    // ------------------------------------------------
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
    const trend = j.choices?.[0]?.message?.content?.trim();
    if (!trend)
      return new Response("Empty AI output", { status: 502 });

    // ------------------------------------------------
    // 5) Persist
    // ------------------------------------------------
    await db.prepare(`
      INSERT INTO ALPHA_04_Trends (id, ticker, summary, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      T,
      trend,
      new Date().toISOString()
    ).run();

    return Response.json({
      ok: true,
      ticker: T,
      reports_used: picked.map(r => ({
        id: r.id,
        type: r.type,
        date: r.date
      }))
    });
  },
};
