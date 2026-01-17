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
      `This summary is used ONLY for downstream trend analysis (not for humans). ` +

      `Be extremely concise, factual, and dense. No fluff, no repetition, no interpretation. ` +
      `Do NOT invent numbers, context, or causal links. If something is unclear, state it briefly. ` +

      `CRITICAL SELECTION RULES:\n` +
      `- Include ONLY facts that describe company-level operating performance or its numeric drivers.\n` +
      `- Prefer facts related to:\n` +
      `  * revenue or net sales (total, segment, product, geography)\n` +
      `  * profitability (gross profit, operating income, margins)\n` +
      `  * aggregated costs that materially affect margins\n` +
      `  * demand, volume, users, backlog (numeric only)\n` +
      `  * management-quantified drivers (FX, pricing, mix, inflation)\n` +
      `  * capital or structural changes with numeric impact\n` +
      `- Exclude numerically precise but economically trivial items.\n` +
      `- Omission is always preferable to weak relevance.\n` +

      `CONSTRAINTS:\n` +
      `- Do NOT summarize or merge facts.\n` +
      `- Do NOT generalize or normalize metrics.\n` +
      `- Preserve metric identity, scope, period, and comparison exactly as stated.\n` +

      `FORMAT:\n` +
      `- Compact paragraphs or short sentences.\n` +
      `- No headings, no bullet symbols, no narrative flow.\n` +
      `- Output MUST be <= 6000 characters.\n` +

      `Facts:\n${bullets}`;


    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        input: [
          {
            role: "system",
            content:
              "Produce a final textual answer. Do not stop at reasoning. Output plain text only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error(data);
      throw new Error(data?.error?.message);
    }

    // Robust extractor (works for 5.2 + mini)
    const text =
      data.output
        ?.flatMap(item =>
          item.type === "message"
            ? item.content
                ?.filter(c => c.type === "output_text")
                ?.map(c => c.text) ?? []
            : []
        )
        .join("") || "";



    // ---- Store summary in ALPHA_01_Reports ----
    await env.DB.prepare(`
      UPDATE ALPHA_01_Reports
      SET summary = ?
      WHERE id = ?
    `).bind(text, report_id).run();

    return Response.json({
      ok: true,
      report_id,
      clusters_used: ordered.length,
      summary_chars: text.length,
    });
  },
};
