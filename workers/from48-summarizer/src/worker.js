export default {
  async fetch(request, env) {
    if (request.method !== "POST")
      return new Response("POST only", { status: 405 });

    const url = new URL(request.url);
    if (url.pathname !== "/summarize")
      return new Response("Not found", { status: 404 });

    const { reportId } = await request.json();
    if (!Number.isFinite(reportId))
      return new Response("Missing or invalid reportId", { status: 400 });

    const db = env.DB;
    
    function eightKPrompt(content) {
      return `
    Summarize this SEC 8-K.
    Focus ONLY on:
    - What happened
    - Who is involved
    - Practical implications
    
    Max 3000 characters. No filler.
    
    CONTENT:
    ${content}
    `.trim();
    }

    function form4Prompt(content) {
      return `
    You are analyzing a SEC FORM 4 (insider transaction).
    
    FIRST, extract the transaction in this EXACT format:
    SECURITY: <string>
    DATE: <YYYY-MM-DD>
    CODE: <P | S | M | A | F | etc>
    DIRECTION: <A | D>
    AMOUNT: <number>
    PRICE: <number or null>
    AFTER: <number>
    CHANGE_PCT: <number or null>
    
    THEN, write an INTERPRETATION section.
    
    INTERPRETATION RULES:
    - Translate CODE and DIRECTION into plain English
    - Compute transaction value = AMOUNT × PRICE (USD)
    - Explain impact relative to AFTER holdings
    - State alpha signal explicitly:
      - Open-market BUY → bullish
      - Open-market SELL → bearish
      - Option exercise / award → low alpha
    - Be factual, concise, and analytical
    - No speculation, no generic language
    
    OUTPUT FORMAT (STRICT):
    
    EXTRACTED:
    <fields>
    
    INTERPRETATION:
    <3–5 sentences explaining meaning and impact>
    
    CONTENT:
    ${content}
    `.trim();
    }
    async function getClusterSummaryIds(reportId) {
      const { results } = await db.prepare(`
        SELECT cs.id
        FROM cluster_summaries cs
        JOIN clusters c ON c.id = cs.cluster_id
        JOIN report_items ri ON ri.id = c.report_item_id
        WHERE ri.report_id = ?
        ORDER BY cs.id
      `).bind(reportId).all();
    
      return results.map(r => r.id);
    }
    
    
    async function getReportStructureId(reportId, structureJson) {
      await db.prepare(`
        INSERT OR IGNORE INTO report_structures (report_id, structure_json)
        VALUES (?, ?)
      `).bind(reportId, structureJson).run();
    
      const row = await db.prepare(`
        SELECT id FROM report_structures WHERE report_id = ?
      `).bind(reportId).first();
    
      return row.id;
    }
    
    // -------------------------------
    // Load all clusters for report
    // -------------------------------
    const { results: clusters } = await db.prepare(`
      SELECT c.id AS cluster_id, c.content
      FROM clusters c
      JOIN report_items ri ON ri.id = c.report_item_id
      WHERE ri.report_id = ?
      ORDER BY c.cluster_index
    `).bind(reportId).all();

    if (!clusters.length)
      return Response.json({ ok: true, message: "No clusters found" });

    // -------------------------------
    // OpenAI helper (Responses API)
    // -------------------------------
    async function summarize(prompt) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: prompt
        })
      });
    
      const j = await res.json();
    
      const text =
        j.output?.[0]?.content?.find(x => x.type === "output_text")?.text;
    
      if (!text)
        throw new Error("OpenAI malformed response: " + JSON.stringify(j));
    
      return text.trim();
    }
    

    const reportTypeRow = await db.prepare(`
      SELECT report_type FROM reports WHERE id = ?
    `).bind(reportId).first();

    const reportType = reportTypeRow?.report_type;


    // -------------------------------
    // SINGLE cluster → direct summary
    // -------------------------------
    if (clusters.length === 1) {
      const c = clusters[0];

      const summary = await summarize(
        reportType === '4'
          ? form4Prompt(c.content)
          : eightKPrompt(c.content)
      );
      

      await db.prepare(`
        INSERT INTO cluster_summaries(cluster_id, title, summary, importance)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cluster_id)
        DO UPDATE SET summary=excluded.summary
      `).bind(c.cluster_id, "SUMMARY", summary,5).run();

      const csIds = await getClusterSummaryIds(reportId);

      // structure
      const structureId = await getReportStructureId(
        reportId,
        JSON.stringify({ cluster_summary_ids: csIds })
      );
      
      
      // report summary = cluster summary
      await db.prepare(`
        INSERT OR IGNORE INTO report_summaries (report_structure_id, title, summary, importance)
        VALUES (?, ?, ?, ?)
      `).bind(
        structureId,
        "Form 4 / 8-K Summary",
        summary,
        5
      ).run();
      
      return Response.json({ ok: true, mode: "single" });

    }

    // -------------------------------
    // MULTI cluster → per-cluster + final
    // -------------------------------
    const partialSummaries = [];

    for (const c of clusters) {
      const s = await summarize(
        reportType === '4'
          ? form4Prompt(c.content)
          : eightKPrompt(c.content)
      );
      

      await db.prepare(`
        INSERT INTO cluster_summaries(cluster_id, title, summary, importance)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cluster_id)
        DO UPDATE SET summary=excluded.summary
      `).bind(c.cluster_id, "SUMMARY", s, 5).run();

      partialSummaries.push(s);
    }

    // Final aggregation
    const finalSummary = await summarize(
      reportType === '4'
        ? `
    You are aggregating multiple FORM 4 insider transaction summaries.
    Produce ONE consolidated summary.
    Highlight:
    - BUY vs SELL
    - Total size
    - Whether activity is compensation-related or discretionary
    No filler.
    
    PARTIAL SUMMARIES:
    ${partialSummaries.join("\n\n---\n\n")}
    `.trim()
        : `
    You are summarizing a full SEC 8-K composed of multiple events.
    Combine into ONE coherent summary.
    Focus on practical implications only.
    Max 3000 characters.
    
    PARTIAL SUMMARIES:
    ${partialSummaries.join("\n\n---\n\n")}
    `.trim()
    );
    

    // Store final summary on first cluster (anchor)
    await db.prepare(`
      INSERT INTO cluster_summaries(cluster_id, title, summary, importance)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cluster_id)
      DO UPDATE SET summary=excluded.summary
    `).bind(clusters[0].cluster_id, "SUMMARY",finalSummary, 5).run();

    const csIds = await getClusterSummaryIds(reportId);

    // structure
    const structureId = await getReportStructureId(
      reportId,
      JSON.stringify({ cluster_summary_ids: csIds })
    );
    
    
    // report summary = aggregated summary
    await db.prepare(`
      INSERT OR IGNORE INTO report_summaries (report_structure_id, title, summary, importance)
      VALUES (?, ?, ?, ?)
    `).bind(
      structureId,
      "Form 4 / 8-K Summary",
      finalSummary,
      5
    ).run();
    
    return Response.json({
      ok: true,
      mode: "multi",
      clusters: clusters.length
    });
    
  }
};
