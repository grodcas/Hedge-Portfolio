export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-trend-orchestrator")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // ------------------------------------------------
    // Wave-based nested chain (runs inside main wave 1000)
    // 1100: beta-gen-orchestrator (if needed)   — fans out further
    // 1400: beta-trend-processor                — final BETA_09_Trend build
    // ------------------------------------------------

    // Final job: beta-trend-processor at wave 1400
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      now,
      "beta-trend-processor",
      JSON.stringify({}),
      "pending",
      1400
    ).run();

    // Gen prerequisite at wave 1100 (runs first, before trend-processor)
    const genRow = await db.prepare(`
      SELECT id
      FROM BETA_08_Gen_Processed
      WHERE date = ?
      LIMIT 1
    `).bind(today).first();

    if (!genRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        now,
        "beta-gen-orchestrator",
        JSON.stringify({}),
        "pending",
        1100
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
