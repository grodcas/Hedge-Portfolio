export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-trend")
      return new Response("Not found", { status: 404 });

    const { ticker } = await req.json();
    if (!ticker)
      return new Response("ticker missing", { status: 400 });

    const db = env.DB;
    const now = new Date().toISOString();
    const T = ticker.toUpperCase();

    // ------------------------------------------------
    // 1) Fetch last 10-K or 10-Q
    // ------------------------------------------------
    // 1) Fetch 4 latest 10-K or 10-Q
    const { results: picked } = await db.prepare(`
      SELECT id, type, date, summary
      FROM ALPHA_01_Reports
      WHERE ticker = ? 
        AND type IN ('10-K', '10-Q')
      ORDER BY date DESC
      LIMIT 4
    `).bind(T).all();

    if (picked.length < 4)
      return new Response(`Not enough reports (10-K/10-Q) for ${T}`, { status: 409 });

    // 2) Sort them chronologically for the workflow logic
    picked.sort((a, b) => a.date.localeCompare(b.date));

    // ------------------------------------------------
    // 3) Enqueue FINAL job FIRST (LIFO)
    // ------------------------------------------------
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status)
      VALUES (?, ?, ?, ?)
    `).bind(
      now,
      "trend-builder",
      JSON.stringify({ ticker: T }),
      "pending"
    ).run();

    // ------------------------------------------------
    // 4) Enqueue dependencies LAST (run first)
    // ------------------------------------------------
    for (const r of picked) {
      const row = await db.prepare(`
        SELECT summary
        FROM ALPHA_01_Reports
        WHERE id = ?
      `).bind(r.id).first();

      if (!row?.summary) {
        await db.prepare(`
          INSERT INTO PROC_01_Job_queue (date, worker, input, status)
          VALUES (?, ?, ?, ?)
        `).bind(
          now,
          "report-orchestrator",
          JSON.stringify({ report_id: r.id }),
          "pending"
        ).run();
      }
    }

    return Response.json({
      ok: true,
      ticker: T,
      reports_considered: picked.map(r => r.id)
    });
  },
};
