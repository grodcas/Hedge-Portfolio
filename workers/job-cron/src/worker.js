export default {

  // =================================================
  // HTTP ENTRYPOINT (planner)
  // =================================================
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/run")
      return new Response("Not found", { status: 404 });

    let body = {};
    try { body = await req.json(); } catch {}

    const { action } = body;
    console.log("RUN ACTION:", action);

    // ---------------- ALPHA ----------------
    if (action === "report") {
      await env.REPORT_ORCHESTRATOR.fetch(
        "https://internal/process-report",
        { method: "POST", body: JSON.stringify(body) }
      );
    }

    if (action === "daily_news") {
      await env.NEWS_ORCHESTRATOR.fetch(
        "https://internal/process-daily-news",
        { method: "POST", body: JSON.stringify(body) }
      );
    }

    if (action === "trend") {
      await env.TREND_ORCHESTRATOR.fetch(
        "https://internal/process-trend",
        { method: "POST", body: JSON.stringify(body) }
      );
    }

    // ---------------- BETA ----------------
    if (action === "gen") {
      await env.BETA_GEN_ORCHESTRATOR.fetch(
        "https://internal/process-gen-orchestrator",
        { method: "POST", body: "{}" }
      );
    }

    if (action === "trend_beta") {
      await env.BETA_TREND_ORCHESTRATOR.fetch(
        "https://internal/process-trend-orchestrator",
        { method: "POST", body: "{}" }
      );
    }

    // 🔔 wake queue ONCE (edge-trigger)
    await env.JOB_QUEUE.send({ type: "work_available" });
    console.log("QUEUE SEND OK");

    return Response.json({ ok: true });
  },

// =================================================
  // QUEUE CONSUMER (engine)
  // =================================================
  async queue(batch, env) {
    console.log("QUEUE START", { batchSize: batch.messages.length });

    // Process a small "batch" of jobs in one go to be efficient
    // but not so many that we hit the 30s timeout.
    let jobsProcessedThisRun = 0;

    while (jobsProcessedThisRun < 5) {
      // 1. Get the next job
      const job = await env.DB.prepare(`
        SELECT id, worker, input FROM PROC_01_Job_queue
        WHERE status = 'pending' ORDER BY id DESC LIMIT 1
      `).first();

      if (!job) {
        console.log("NO MORE JOBS PENDING");
        break; 
      }

      // 2. Lock the job
      const lock = await env.DB.prepare(`
        UPDATE PROC_01_Job_queue SET status='running', last_update=datetime('now')
        WHERE id=? AND status='pending'
      `).bind(job.id).run();

      if (lock.changes === 0) break;

      try {
        console.log("EXECUTING:", job.worker);

        // 3. Service Call
        const response = await env[this.getBindingName(job.worker)].fetch(
          this.getEndpoint(job.worker), 
          { method: "POST", body: job.input || "{}" }
        );

        if (!response.ok) throw new Error(`Worker returned ${response.status}`);

        // 4. Mark Done
        await env.DB.prepare(`
          UPDATE PROC_01_Job_queue SET status='done', last_update=datetime('now') WHERE id=?
        `).bind(job.id).run();

        jobsProcessedThisRun++;
        console.log("DONE:", job.worker);

      } catch (err) {
        console.error("FAILED:", job.worker, err.message);
        await env.DB.prepare(`
          UPDATE PROC_01_Job_queue SET status='failed', last_update=datetime('now') WHERE id=?
        `).bind(job.id).run();
        // Break the loop on error to let the queue retry or handle failure
        break; 
      }
    }

    // 5. THE NUDGE: If there's still work, send a message for the next worker
    const remaining = await env.DB.prepare(`SELECT id FROM PROC_01_Job_queue WHERE status='pending' LIMIT 1`).first();
    if (remaining) {
      console.log("REMAINING WORK DETECTED - SENDING NUDGE");
      await env.JOB_QUEUE.send({ type: "continue" });
    }

    // 6. FINALLY Acknowledge the original message
    batch.ackAll();
  },

  // Helper to map your case statements more cleanly
  getBindingName(worker) {
    const maps = {
      "beta-macro-processor": "beta_macro_processor",
      "beta-sentiment-processor": "beta_sentiment_processor",
      "beta-news-processor": "beta_news_processor",
      "beta-gen-processor": "beta_gen_processor",
      "beta-trend-processor": "beta_trend_processor",
      "beta-gen-orchestrator": "BETA_GEN_ORCHESTRATOR",
      "beta-trend-orchestrator": "BETA_TREND_ORCHESTRATOR"
    };
    return maps[worker];
  },

  getEndpoint(worker) {
    if (worker.includes("orchestrator")) return `https://internal/process-${worker.split('-')[1]}-orchestrator`;
    return `https://internal/process-${worker.split('-')[1]}`;
  }
};
