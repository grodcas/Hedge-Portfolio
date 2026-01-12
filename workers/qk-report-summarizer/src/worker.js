export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/summarize-report")
      return new Response("Not found", { status: 404 });

    const { report_id } = await req.json();
    if (!report_id)
      return new Response("report_id missing", { status: 400 });

    // ---- Get structure from ALPHA_01_Reports ----
    const r = await env.DB.prepare(`
      SELECT structure
      FROM ALPHA_01_Reports
      WHERE id = ?
      LIMIT 1
    `).bind(report_id).first();

    if (!r)
      return new Response("report not found", { status: 404 });

    let clusterIds;
    try {
      const parsed = JSON.parse(r.structure);
      if (Array.isArray(parsed)) clusterIds = parsed;
      else if (Array.isArray(parsed?.clusters)) clusterIds = parsed.clusters;
      else clusterIds = [];
    } catch {
      return new Response("Invalid structure", { status: 400 });
    }

    if (!clusterIds.length)
      return new Response("No clusters in structure", { status: 404 });

    // ---- Fetch cluster summaries directly from ALPHA_02_Clusters ----
    const placeholders = clusterIds.map(() => "?").join(",");
    const cs = await env.DB.prepare(`
      SELECT id, title, summary, importance
      FROM ALPHA_02_Clusters
      WHERE id IN (${placeholders})
    `).bind(...clusterIds).all();

    const rows = cs.results || [];
    if (!rows.length)
      return new Response("No clusters found", { status: 404 });

    // Keep original order
    const map = new Map(rows.map(r => [r.id, r]));
    const ordered = clusterIds.map(id => map.get(id)).filter(Boolean);

    const bullets = ordered.map(r =>
      `- ${r.title}: ${r.summary}`.replace(/\s+/g, " ").trim()
    ).join("\n");

    const prompt =
      `Write a human-readable SEC report summary based ONLY on the provided bullet facts. ` +
      `Be extremely concise, factual, and dense. No fluff, no generic statements, no repetition. ` +
      `Do not invent numbers or context. If something is unclear, state it briefly. ` +
      `Output MUST be <= 6000 characters. Use short sentences and compact paragraphs. ` +
      `Facts:\n${bullets}`;

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

    const j = await aiResp.json();
    const out = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!out)
      return new Response("Empty AI output", { status: 500 });

    // ---- Store summary in ALPHA_01_Reports ----
    await env.DB.prepare(`
      UPDATE ALPHA_01_Reports
      SET summary = ?
      WHERE id = ?
    `).bind(out, report_id).run();

    return Response.json({
      ok: true,
      report_id,
      clusters_used: ordered.length,
      summary_chars: out.length,
    });
  },
};
