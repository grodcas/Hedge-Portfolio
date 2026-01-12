export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-daily-news")
      return new Response("Not found", { status: 404 });

    const { ticker } = await req.json();
    if (!ticker)
      return new Response("ticker missing", { status: 400 });

    const db = env.DB;
    const now = new Date().toISOString();
    const today = "2025-12-29";
    const T = ticker.toUpperCase();

    // --------------------------------------------
    // 1) Find today Form 4 / 8-K
    // --------------------------------------------
    const { results: reports } = await db.prepare(`
      SELECT id, summary
      FROM ALPHA_01_Reports
      WHERE ticker = ?
        AND date = ?
        AND type IN ('4', '8-K')
    `).bind(T, today).all();

    // --------------------------------------------
    // 2) Enqueue FINAL job FIRST (LIFO)
    // --------------------------------------------
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status)
      VALUES (?, ?, ?, ?)
    `).bind(
      now,
      "news-summarizer",
      JSON.stringify({ ticker: T }),
      "pending"
    ).run();

    // --------------------------------------------
    // 3) Enqueue dependencies LAST (run first)
    // --------------------------------------------
    for (const r of reports) {
      if (!r.summary) {
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

    return Response.json({ ok: true, ticker: T });
  },
};
