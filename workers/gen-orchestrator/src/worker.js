export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-gen-orchestrator")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // ------------------------------------------------
    // Wave-based nested chain
    // 1200: beta-macro-processor + beta-sentiment-processor (parallel prerequisites)
    // 1300: beta-gen-processor (runs after 1200 completes)
    // ------------------------------------------------

    // Final: beta-gen-processor at wave 1300
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      now,
      "beta-gen-processor",
      JSON.stringify({}),
      "pending",
      1300
    ).run();

    // Sentiment prerequisite at wave 1200
    const sentRow = await db.prepare(`
      SELECT id FROM BETA_06_Sentiment_Processed WHERE date = ? LIMIT 1
    `).bind(today).first();

    if (!sentRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
        VALUES (?, ?, ?, ?, ?)
      `).bind(now, "beta-sentiment-processor", JSON.stringify({ date: "LATEST" }), "pending", 1200).run();
    }

    // Macro prerequisite at wave 1200 (runs in parallel with sentiment)
    const macroRow = await db.prepare(`
      SELECT id FROM BETA_05_Macro_Processed
      WHERE date = ?
      LIMIT 1
    `).bind(today).first();

    if (!macroRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        now,
        "beta-macro-processor",
        JSON.stringify({ date: "LATEST" }),
        "pending",
        1200
      ).run();
    }

    return Response.json({
      ok: true,
      date: today,
      enqueued: {
        final: "beta-gen-processor",
        sentiment_if_missing: !sentRow,
        macro_if_missing: !macroRow
      }
    });
  },
};
