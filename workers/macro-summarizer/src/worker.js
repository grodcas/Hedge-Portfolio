export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-macro")
      return new Response("Not found", { status: 404 });

    const { date } = await req.json();
    if (!date)
      return new Response("date missing", { status: 400 });

    const sanitizedDate = date.split('T')[0];
    const db = env.DB;
    const now = new Date().toISOString();

    // --------------------------------------------
    // INPUT: macro components
    // --------------------------------------------
    // Remove sanitizedDate. Use this query to get the latest row for each type:
    const { results: macro } = await db.prepare(`
      SELECT type, summary, MAX(date) as latest_date
      FROM BETA_03_Macro
      WHERE type IN (
        'CPI', 
        'PPI', 
        'Employment', 
        'Bank Reserves', 
        'Inflation Expectations'
      )
      GROUP BY type
    `).all();

    // Important: Change the error response so it doesn't crash the workflow
    if (!macro.length) {
      return Response.json({ ok: false, message: "No data in DB" }, { status: 200 });
    }

    const prompt = buildPrompt(date, macro);

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
    const hashInput = `${date}|macro`;
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(hashInput)
    );
    const id = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    await db.prepare(`
      INSERT INTO BETA_05_Macro_Processed
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

function buildPrompt(date, macro) {
  return `
You are a macroeconomic analyst.

DATE: ${date}

Your task is to synthesize the following macroeconomic indicators
into a single coherent macro summary.

Focus on signal, interactions, and directionality.
No bullet points. One compact analytical narrative.

MACRO INPUTS:
${macro.map(m =>
  `• ${m.type}\n${m.summary}`
).join("\n\n")}
`.trim();
}
