export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/build-structure") {
      return new Response("Not found", { status: 404 });
    }

    const { report_id } = await req.json();
    if (!report_id)
      return new Response("report_id missing", { status: 400 });

    // ---- Fetch clusters ----
    const rows = await env.DB.prepare(`
      SELECT
        c.id AS cluster_id,
        c.importance,
        c.title,
        c.summary
      FROM ALPHA_02_Clusters c
      WHERE c.report_id = ?
      ORDER BY c.importance DESC
    `).bind(report_id).all();

    const clusters = rows.results;
    if (!clusters.length)
      return new Response("No clusters found", { status: 404 });

    const PER_CALL_LIMIT = 15;
    const MAX_OUTPUT = 25;

    // ---- Prompt ----
    const prompt =
      `You are selecting SEC filing clusters to support a TREND-READY, metric-based report summary.

Each cluster has: cluster_id, importance (1–10), title, summary.

GOAL:
Select clusters that enable extraction of COMPANY-LEVEL, NUMERIC performance facts.

SELECTION PRINCIPLES:
- Prefer clusters mapping to economic METRIC ANCHORS.
- Importance is a guide, not a rule.
- Exclude boilerplate, accounting policy, calendars.
- Exclude clusters that only repeat already-covered metrics.

METRIC ANCHORS (orientative):
- Revenue / net sales
- Profitability (gross / operating, margins or $)
- Costs (only if material)
- Demand / volume / users / backlog
- Management-quantified drivers (FX, pricing, mix)
- Capital or structural changes with numeric impact
- Explicit negative performance signals

OUTPUT RULES:
- Output ONLY a JSON array of cluster_id strings.
- Max ${PER_CALL_LIMIT} ids.
- No explanations. No markdown.

Clusters:
${JSON.stringify(clusters)}
`;

    // ---- Call OpenAI (GPT-5 mini) ----
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "You MUST produce a JSON array of cluster_id strings.. Do not stop after reasoning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        text: {
          format: { type: "text" }
        }
      }),
    });


    const data = await resp.json();


    if (!resp.ok) {
      console.error(data);
      throw new Error(data?.error?.message || "OpenAI request failed");
    }

    // ---- Extract JSON string (GPT-5 real shape) ----
    const raw =
      data.output
        ?.flatMap(o =>
          o.type === "message"
            ? o.content?.map(c => c.text).filter(Boolean) ?? []
            : []
        )
        .join("")
        .trim();

    if (!raw) {
      throw new Error("Model returned no JSON output");
    }

    // ---- Parse JSON (array expected) ----
    let ids;
    try {
      ids = JSON.parse(raw);
    } catch {
      console.error("Raw model output:", raw);
      throw new Error("Model did not return valid JSON");
    }

    if (!Array.isArray(ids)) {
      throw new Error("Model output is not a JSON array");
    }

    // ---- Deduplicate + cap ----
    const selected = [...new Set(ids)].slice(0, MAX_OUTPUT);

    // ---- Store structure ----
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
