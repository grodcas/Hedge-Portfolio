export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-trend-orchestrator")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // ------------------------------------------------
    // 1) FINAL job FIRST (LIFO) → builds BETA_09_Trend
    // ------------------------------------------------
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status)
      VALUES (?, ?, ?, ?)
    `).bind(
      now,
      "beta-trend-processor",   // BETA_09_Trend summarizer
      JSON.stringify({}),
      "pending"
    ).run();


    // ------------------------------------------------
    // 2) News prerequisite (runs before trend)
    // ------------------------------------------------
    /*
    const newsRow = await db.prepare(`
      SELECT id
      FROM BETA_07_News_Processed
      WHERE date = ?
      LIMIT 1
    `).bind(today).first();

    if (!newsRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        now,
        "beta-news-processor",   // BETA_07_News_Processed summarizer
        JSON.stringify({ date: today }),
        "pending"
      ).run();
    }
*/
    // ------------------------------------------------
    // 3) Gen prerequisite (runs FIRST)
    // ------------------------------------------------
    const genRow = await db.prepare(`
      SELECT id
      FROM BETA_08_Gen_Processed
      WHERE date = ?
      LIMIT 1
    `).bind(today).first();

    if (!genRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        now,
        "beta-gen-orchestrator", // orchestrator you created before
        JSON.stringify({}),
        "pending"
      ).run();
    }

    return Response.json({
      ok: true,
      date: today,
      enqueued: {
        trend: true,
        gen_if_missing: !genRow
      }
    });
  },
};
