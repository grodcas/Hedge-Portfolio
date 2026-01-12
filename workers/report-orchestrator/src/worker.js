export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-report")
      return new Response("Not found", { status: 404 });

    const { report_id } = await req.json();
    if (!report_id)
      return new Response("report_id missing", { status: 400 });

    const db = env.DB;
    const now = new Date().toISOString();

    // ------------------------------------------------
    // 1) Identify report type
    // ------------------------------------------------
    const report = await db.prepare(`
      SELECT type
      FROM ALPHA_01_Reports
      WHERE id = ?
    `).bind(report_id).first();

    if (!report)
      return new Response("Report not found", { status: 404 });

    const type = report.type;

    // ------------------------------------------------
    // FORM 4
    // ------------------------------------------------
    if (type === "4") {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        now,
        "form4-summarizer",
        JSON.stringify({ report_id }),
        "pending"
      ).run();

      return Response.json({ ok: true });
    }

    // ------------------------------------------------
    // 8-K
    // ------------------------------------------------
    if (type === "8-K") {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        now,
        "8k-summarizer",
        JSON.stringify({ report_id }),
        "pending"
      ).run();

      return Response.json({ ok: true });
    }

    // ------------------------------------------------
    // 10-K / 10-Q
    // ------------------------------------------------
    if (type === "10-K" || type === "10-Q") {

      // --------------------------------------------
      // C) FINAL step FIRST (LIFO)
      // --------------------------------------------
      const summaryRow = await db.prepare(`
        SELECT summary
        FROM ALPHA_01_Reports
        WHERE id = ?
      `).bind(report_id).first();

      if (!summaryRow?.summary) {
        await db.prepare(`
          INSERT INTO PROC_01_Job_queue (date, worker, input, status)
          VALUES (?, ?, ?, ?)
        `).bind(
          now,
          "qk-report-summarizer",
          JSON.stringify({ report_id }),
          "pending"
        ).run();
      }

      // --------------------------------------------
      // B) Structure SECOND
      // --------------------------------------------
      const structureRow = await db.prepare(`
        SELECT structure
        FROM ALPHA_01_Reports
        WHERE id = ?
      `).bind(report_id).first();

      let structureValid = false;
      try {
        const parsed = JSON.parse(structureRow?.structure ?? "null");
        structureValid = Array.isArray(parsed) && parsed.length > 0;
      } catch {}

      if (!structureValid) {
        await db.prepare(`
          INSERT INTO PROC_01_Job_queue (date, worker, input, status)
          VALUES (?, ?, ?, ?)
        `).bind(
          now,
          "qk-structure-builder",
          JSON.stringify({ report_id }),
          "pending"
        ).run();
      }

      // --------------------------------------------
      // A) Prerequisites LAST (run first)
      // --------------------------------------------
      const { results: clusters } = await db.prepare(`
        SELECT id, title, summary, importance
        FROM ALPHA_02_Clusters
        WHERE report_id = ?
      `).bind(report_id).all();

      for (const c of clusters) {
        const invalid =
          !c.summary ||
          !c.title ||
          !Number.isInteger(c.importance);

        if (invalid) {
          await db.prepare(`
            INSERT INTO PROC_01_Job_queue (date, worker, input, status)
            VALUES (?, ?, ?, ?)
          `).bind(
            now,
            "qk-cluster-summarizer",
            JSON.stringify({ cluster_id: c.id }),
            "pending"
          ).run();
        }
      }

      return Response.json({
        ok: true,
        enqueued: "10K/10Q pipeline",
        clusters: clusters.length
      });
    }

    return new Response("Unsupported report type", { status: 400 });
  },
};
