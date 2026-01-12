export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build-structure") {
      return new Response("Not found", { status: 404 });
    }

    const { report_id } = await req.json();
    if (!report_id)
      return new Response("report_id missing", { status: 400 });

    // ---- Fetch cluster titles + importance (NEW SCHEMA) ----
    const rows = await env.DB.prepare(`
      SELECT
        c.id AS cluster_id,
        c.importance,
        c.title
      FROM ALPHA_02_Clusters c
      WHERE c.report_id = ?
      ORDER BY c.importance DESC
    `).bind(report_id).all();

    const clusters = rows.results;
    if (!clusters.length) {
      return new Response("No cluster summaries found", { status: 404 });
    }

    const MAX_OUTPUT = 25;
    const MAX_INPUT_PER_AI = 60;
    const calls = Math.ceil(clusters.length / MAX_INPUT_PER_AI);
    const perCallLimit = Math.ceil(MAX_OUTPUT / calls);

    let selected = [];

    for (let i = 0; i < calls; i++) {
      const slice = clusters.slice(
        i * MAX_INPUT_PER_AI,
        (i + 1) * MAX_INPUT_PER_AI
      );

      const prompt =
        `You are selecting the most decision-relevant SEC filing clusters. ` +
        `Each cluster has an importance score (1–10) and a title. ` +
        `Select ONLY cluster_ids that materially affect investor understanding. ` +
        `Trash, boilerplate, or repetitive topics should be excluded even if scored. ` +
        `Return a JSON array of cluster_ids only. ` +
        `Maximum selections allowed: ${perCallLimit}. ` +
        `Clusters:\n` +
        JSON.stringify(slice);

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
      const clean = text.replace(/```json|```/g, "").trim();
      const ids = JSON.parse(clean);

      selected.push(...ids);
    }

    // ---- Deduplicate + cap at 25 ----
    selected = [...new Set(selected)].slice(0, MAX_OUTPUT);

    // ---- Store structure in ALPHA_01_Reports ----
    await env.DB.prepare(`
      UPDATE ALPHA_01_Reports
      SET structure = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(selected),
      report_id
    ).run();

    return Response.json({
      ok: true,
      report_id,
      clusters_selected: selected.length,
      clusters: selected,
    });
  },
};
