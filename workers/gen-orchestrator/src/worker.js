export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/process-gen-orchestrator")
      return new Response("Not found", { status: 404 });

    const db = env.DB;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // ------------------------------------------------
    // 1) ENQUEUE FINAL job FIRST (LIFO)
    // ------------------------------------------------
    await db.prepare(`
      INSERT INTO PROC_01_Job_queue (date, worker, input, status)
      VALUES (?, ?, ?, ?)
    `).bind(
      now,
      "beta-gen-processor",                 // <-- your BETA_08_Gen_Processed summarizer worker name
      JSON.stringify({}),                   // no input needed (it pulls latest)
      "pending"
    ).run();

    // ------------------------------------------------
    // 2) Sentiment prerequisite (enqueue AFTER final, so it runs BEFORE final)
    // ------------------------------------------------
    const sentRow = await db.prepare(`
      SELECT id FROM BETA_06_Sentiment_Processed WHERE date = ? LIMIT 1
    `).bind(today).first();
    
    if (!sentRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "beta-sentiment-processor", JSON.stringify({ date: "LATEST" }), "pending").run();
    }

    // ------------------------------------------------
    // 3) Macro prerequisite (enqueue LAST, so it runs FIRST)
    // ------------------------------------------------
    // 3) Macro prerequisite
    const macroRow = await db.prepare(`
      SELECT id FROM BETA_05_Macro_Processed 
      WHERE date = ? 
      LIMIT 1
    `).bind(today).first();

    if (!macroRow) {
      await db.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(
        now,
        "beta-macro-processor",
        // Pass 'LATEST' instead of a specific date, 
        // or just an empty object if you use the query above.
        JSON.stringify({ date: "LATEST" }), 
        "pending"
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
