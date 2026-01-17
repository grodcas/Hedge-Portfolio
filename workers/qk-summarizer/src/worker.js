export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/summarize-cluster")
      return new Response("Not found", { status: 404 });

    const { cluster_id } = await req.json();
    if (!cluster_id)
      return new Response("cluster_id missing", { status: 400 });

    // ---- Fetch cluster + context ----
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

    // ---- Item-specific prompts (latest, size-controlled) ----
    const baseHeader =
      `You are summarizing a SINGLE SEC filing cluster for downstream trend analysis. ` +
      `Ticker=${row.ticker}, ReportType=${row.report_type}, ReportDate=${row.report_date}, Item=${row.item}. ` +
      `One filing only. No external history. ` +
      `Prioritize numeric and comparative information explicitly stated. ` +
      `Precision > coverage. Fewer, well-anchored facts are preferred. ` +
      `If a number’s meaning is unclear, preserve original wording. Do not reinterpret or invent context. ` +
      `COMPRESSION RULES: Target SUMMARY length 120–150 tokens (hard max 160). ` +
      `Output 5–6 bullets maximum. One sentence per bullet. ` +
      `Do NOT enumerate all segments or products; aggregate similar movements and name only material outliers. ` +
      `Output only: IMPORTANCE (1–10), TITLE (40 tokens), SUMMARY (bullets). `;

    const promptItem7 =
      baseHeader +
      `This is Item 7 (Management’s Discussion and Analysis). ` +
      `Focus on business performance during the period. ` +
      `High-signal content includes: ` +
      `overall company performance (e.g., total net sales/revenue and YoY change); ` +
      `major drivers explicitly stated by management; ` +
      `segment or geographic performance ONLY when it materially diverges from the overall trend; ` +
      `product or service category performance ONLY for major contributors or notable declines; ` +
      `explicit macro or FX effects tied to numeric changes. ` +
      `De-prioritize product announcements without quantified impact and granular operational details. ` +
      `Cluster: ${row.content}`;

    const promptItem8 =
      baseHeader +
      `This is Item 8 (Financial Statements). ` +
      `Focus on primary financial statement outcomes. ` +
      `High-signal content includes: ` +
      `income statement totals and changes (revenue, operating income, net income); ` +
      `balance sheet totals if explicitly stated (assets, liabilities, equity); ` +
      `cash flow statement totals (operating, investing, financing); ` +
      `explicit period-over-period comparisons shown in tables. ` +
      `Do NOT restate full tables or add interpretation beyond stated facts. ` +
      `Cluster: ${row.content}`;

    const promptItem10Q_1 =
      baseHeader +
      `This is Item 1 of Form 10-Q (Financial Statements). ` +
      `Focus on quarterly or year-to-date financial results. ` +
      `High-signal content includes: ` +
      `quarterly or YTD revenue/net sales; ` +
      `net income or loss; ` +
      `cash flow totals if stated; ` +
      `comparisons to the same prior-year quarter or YTD period. ` +
      `Avoid narrative unless directly tied to a stated metric. ` +
      `Cluster: ${row.content}`;

    const promptItem10Q_2 =
      baseHeader +
      `This is Item 2 of Form 10-Q (Management’s Discussion and Analysis). ` +
      `Focus on what changed during the quarter and why. ` +
      `High-signal content includes: ` +
      `quarter-over-quarter or YTD changes in revenue or operating results; ` +
      `segment or product performance ONLY if materially different from the overall trend; ` +
      `management explanations explicitly tied to numeric changes. ` +
      `De-prioritize boilerplate or generic commentary. ` +
      `Cluster: ${row.content}`;

    const promptItem10Q_3 =
      baseHeader +
      `This is Item 3 of Form 10-Q (Quantitative and Qualitative Disclosures About Market Risk). ` +
      `Focus on quantified market risk disclosures. ` +
      `High-signal content includes: ` +
      `interest rate risk measures; ` +
      `foreign exchange risk exposures; ` +
      `commodity or other market risk sensitivities; ` +
      `explicit comparisons to prior periods if stated. ` +
      `Ignore purely qualitative risk descriptions without numbers. ` +
      `Cluster: ${row.content}`;


    let prompt;
    if (row.report_type === "10-K" && row.item === "7") prompt = promptItem7;
    else if (row.report_type === "10-K" && row.item === "8") prompt = promptItem8;
    else if (row.report_type === "10-Q" && row.item === "1") prompt = promptItem10Q_1;
    else if (row.report_type === "10-Q" && row.item === "2") prompt = promptItem10Q_2;
    else if (row.report_type === "10-Q" && row.item === "3") prompt = promptItem10Q_3;
    else {
      prompt =
        baseHeader +
        `Summarize only clearly stated numeric or comparative information. ` +
        `SUMMARY should be concise bullets. ` +
        `Cluster: ${row.content}`;
    }

    // ---- Call OpenAI (GPT-5 mini) ----
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: prompt,              // simplest form
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("OpenAI error:", data);
      throw new Error(data?.error?.message || "OpenAI request failed");
    }

    // Extract text from Responses API shape
    const text =
      data.output
        ?.flatMap(item => item.content || [])
        ?.filter(c => c.type === "output_text")
        ?.map(c => c.text)
        ?.join("") || "";
    // ---- Parse output ----
    const imp = Number(text.match(/IMPORTANCE:\s*(\d+)/)?.[1] ?? 1);
    const title = text.match(/TITLE:\s*(.+)/)?.[1] ?? "";
    const summary = text.match(/SUMMARY:\s*([\s\S]+)/)?.[1] ?? "";

    // ---- Store result ----
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
