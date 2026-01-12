export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/summarize-cluster")
      return new Response("Not found", { status: 404 });

    const { cluster_id } = await req.json();
    if (!cluster_id)
      return new Response("cluster_id missing", { status: 400 });

    // ---- Fetch cluster + context (NEW SCHEMA) ----
    const row = await env.DB.prepare(`
      SELECT
        c.id,
        c.content,
        c.item,
        r.type   AS report_type,
        r.date   AS report_date,
        r.ticker AS ticker
      FROM ALPHA_02_Clusters c
      JOIN ALPHA_01_Reports r ON r.id = c.report_id
      WHERE c.id = ?
    `).bind(cluster_id).first();

    if (!row)
      return new Response("Cluster not found", { status: 404 });

    // ---- Prompt (unchanged) ----
    const prompt =
      `You are extracting investor belief-update signals from a single SEC filing cluster. ` +
      `Context: Ticker=${row.ticker}, ReportType=${row.report_type}, ReportDate=${row.report_date}, ReportItem=${row.item}. ` +
      `Do not assume external history. Importance scale: 1 = routine or boilerplate, no belief update; ` +
      `5 = moderate, expected changes; 10 = rare, material information that would likely change positioning. ` +
      `Focus on stated numeric changes, comparisons, magnitudes, and explanations. Tables and numbers are high signal. ` +
      `Boilerplate defaults to low importance. Overstating importance is worse than understating. ` +
      `Output only: IMPORTANCE (1–10), TITLE (one sentence), SUMMARY (70–120 tokens). ` +
      `Cluster: ${row.content}`;

    // ---- Call OpenAI ----
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const text = (await aiResp.json()).choices[0].message.content;

    // ---- Parse output ----
    const imp = Number(text.match(/IMPORTANCE:\s*(\d+)/)?.[1] ?? 1);
    const title = text.match(/TITLE:\s*(.+)/)?.[1] ?? "";
    const summary = text.match(/SUMMARY:\s*([\s\S]+)/)?.[1] ?? "";

    // ---- Store directly in ALPHA_02_Clusters ----
    await env.DB.prepare(`
      UPDATE ALPHA_02_Clusters
      SET importance = ?,
          title = ?,
          summary = ?
      WHERE id = ?
    `).bind(imp, title, summary, cluster_id).run();

    return Response.json({ ok: true, cluster_id, importance: imp });
  },
};
