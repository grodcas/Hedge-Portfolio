export default {
  async fetch(request, env) {
    if (request.method !== "POST")
      return new Response("POST only", { status: 405 });

    const url = new URL(request.url);
    if (url.pathname !== "/summarize-form4")
      return new Response("Not found", { status: 404 });

    const { report_id } = await request.json();
    if (!report_id)
      return new Response("Missing report_id", { status: 400 });

    const db = env.DB;

    function form4Prompt(content) {
      return `
You are analyzing a SEC FORM 4 (insider transaction).

FIRST, extract the transaction in this EXACT format:
SECURITY:
DATE:
CODE:
DIRECTION:
AMOUNT:
PRICE:
AFTER:
CHANGE_PCT:

THEN, write an INTERPRETATION section.

EXTRACTED:
<fields>

INTERPRETATION:
<3–5 sentences>

CONTENT:
${content}
`.trim();
    }

    async function summarize(prompt) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
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

      const j = await res.json();
      return j.choices[0].message.content.trim();
    }

    // ---- Load clusters ----
    const { results: clusters } = await db.prepare(`
      SELECT id AS cluster_id, content
      FROM ALPHA_02_Clusters
      WHERE report_id = ?
      ORDER BY id
    `).bind(report_id).all();

    if (!clusters.length)
      return Response.json({ ok: true, message: "No clusters" });

    // ---- SINGLE ----
    if (clusters.length === 1) {
      const s = await summarize(form4Prompt(clusters[0].content));

      await db.prepare(`
        UPDATE ALPHA_02_Clusters
        SET title='SUMMARY', summary=?, importance=5
        WHERE id=?
      `).bind(s, clusters[0].cluster_id).run();

      await db.prepare(`
        UPDATE ALPHA_01_Reports
        SET structure=?, summary=?
        WHERE id=?
      `).bind(
        JSON.stringify([clusters[0].cluster_id]),
        s,
        report_id
      ).run();

      return Response.json({ ok: true, mode: "single" });
    }

    // ---- MULTI ----
    const partial = [];

    for (const c of clusters) {
      const s = await summarize(form4Prompt(c.content));

      await db.prepare(`
        UPDATE ALPHA_02_Clusters
        SET title='SUMMARY', summary=?, importance=5
        WHERE id=?
      `).bind(s, c.cluster_id).run();

      partial.push(s);
    }

    const final = await summarize(`
You are aggregating multiple FORM 4 insider transactions.
Highlight BUY vs SELL, total size, and signal.

${partial.join("\n\n---\n\n")}
`.trim());

    await db.prepare(`
      UPDATE ALPHA_02_Clusters
      SET summary=?
      WHERE id=?
    `).bind(final, clusters[0].cluster_id).run();

    await db.prepare(`
      UPDATE ALPHA_01_Reports
      SET structure=?, summary=?
      WHERE id=?
    `).bind(
      JSON.stringify(clusters.map(c => c.cluster_id)),
      final,
      report_id
    ).run();

    return Response.json({ ok: true, mode: "multi", clusters: clusters.length });
  },
};
