var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
import { WorkflowEntrypoint } from "cloudflare:workers";
var JobWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "JobWorkflow");
  }
  async run(event, step) {
    console.log("WORKFLOW STARTED");
    while (true) {
      const job = await step.do("fetch-next-job", async () => {
        return await this.env.DB.prepare(`
          SELECT id, worker, input FROM PROC_01_Job_queue
          WHERE status = 'pending' ORDER BY id DESC LIMIT 1
        `).first();
      });
      if (!job) {
        console.log("QUEUE EMPTY - FINISHING");
        // Write completion timestamp to DB for dashboard polling
        await step.do("write-completion-flag", async () => {
          await this.env.DB.prepare(`
            INSERT INTO PROC_02_Workflow_status (id, status, completed_at)
            VALUES ('latest', 'done', datetime('now'))
            ON CONFLICT(id) DO UPDATE SET status='done', completed_at=datetime('now')
          `).run();
        });
        break;
      }
      await step.do(`execute-${job.worker}-${job.id}`, async () => {
        console.log(`PROCESSING: ${job.worker} (ID: ${job.id})`);
        await this.env.DB.prepare("UPDATE PROC_01_Job_queue SET status='running', last_update=datetime('now') WHERE id=?").bind(job.id).run();
        try {
          let res;
          const body = job.input || "{}";
          switch (job.worker) {
            // --- BETA PROCESSORS ---
            case "beta-macro-processor":
              res = await this.env.beta_macro_processor.fetch("https://internal/process-macro", { method: "POST", body });
              break;
            case "beta-sentiment-processor":
              res = await this.env.beta_sentiment_processor.fetch("https://internal/process-sentiment", { method: "POST", body });
              break;
            case "macro-news-summarizer":
              res = await this.env.macro_news_summarizer.fetch("https://internal/process-news", { method: "POST", body });
              break;
            case "beta-gen-processor":
              res = await this.env.beta_gen_processor.fetch("https://internal/process-gen", { method: "POST", body });
              break;
            case "beta-trend-processor":
              res = await this.env.beta_trend_processor.fetch("https://internal/process-trend", { method: "POST", body });
              break;
            // --- BETA ORCHESTRATORS ---
            case "beta-gen-orchestrator":
              res = await this.env.BETA_GEN_ORCHESTRATOR.fetch("https://internal/process-gen-orchestrator", { method: "POST", body });
              break;
            case "beta-trend-orchestrator":
              res = await this.env.BETA_TREND_ORCHESTRATOR.fetch("https://internal/process-trend-orchestrator", { method: "POST", body });
              break;
            // --- ALPHA ORCHESTRATORS ---
            case "report-orchestrator":
              res = await this.env.REPORT_ORCHESTRATOR.fetch("https://internal/process-report", { method: "POST", body });
              break;
            case "news-orchestrator":
              res = await this.env.NEWS_ORCHESTRATOR.fetch("https://internal/process-daily-news", { method: "POST", body });
              break;
            case "trend-orchestrator":
              res = await this.env.TREND_ORCHESTRATOR.fetch("https://internal/process-trend", { method: "POST", body });
              break;
            // --- SUMMARIZERS & BUILDERS ---
            case "form4-summarizer":
              res = await this.env.form4_summarizer.fetch("https://internal/summarize-form4", { method: "POST", body });
              break;
            case "8k-summarizer":
              res = await this.env.eightk_summarizer.fetch("https://internal/summarize-8k", { method: "POST", body });
              break;
            case "qk-cluster-summarizer":
              res = await this.env.qk_cluster_summarizer.fetch("https://internal/summarize-cluster", { method: "POST", body });
              break;
            case "qk-structure-builder":
              res = await this.env.qk_structure_builder.fetch("https://internal/build-structure", { method: "POST", body });
              break;
            case "qk-report-summarizer":
              res = await this.env.qk_report_summarizer.fetch("https://internal/summarize-report", { method: "POST", body });
              break;
            case "news-summarizer":
              res = await this.env.news_summarizer.fetch("https://internal/daily-news", { method: "POST", body });
              break;
            case "trend-builder":
              res = await this.env.trend_builder.fetch("https://internal/build-trend", { method: "POST", body });
              break;
            case "daily-macro-summarizer":
              res = await this.env.DAILY_MACRO_SUMMARIZER.fetch("https://internal/process-daily-macro", { method: "POST", body });
              break;
            default:
              throw new Error(`Unknown worker: ${job.worker}`);
          }
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Worker ${job.worker} failed (${res.status}): ${errText}`);
          }
          await this.env.DB.prepare("UPDATE PROC_01_Job_queue SET status='done', last_update=datetime('now') WHERE id=?").bind(job.id).run();
          console.log(`DONE: ${job.worker}`);
        } catch (err) {
          console.error(`FAILED: ${job.worker}`, err.message);
          await this.env.DB.prepare("UPDATE PROC_01_Job_queue SET status='failed', last_update=datetime('now') WHERE id=?").bind(job.id).run();
          throw err;
        }
      });
    }
  }
};
var TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS"
];
var index_default = {
  async fetch(req, this_env) {
    const url = new URL(req.url);
    if (url.pathname !== "/run") return new Response("Not found", { status: 404 });
    let body = {};
    try {
      body = await req.json();
    } catch {
    }
    const { action } = body;
    if (action === "report") {
      await this_env.REPORT_ORCHESTRATOR.fetch("https://internal/process-report", { method: "POST", body: JSON.stringify(body) });
    }
    if (action === "daily_news") {
      const now = new Date().toISOString();

      // Clear pending/running jobs before starting fresh
      await this_env.DB.prepare(`
        DELETE FROM PROC_01_Job_queue WHERE status IN ('pending', 'running')
      `).run();

      // Single orchestrator job handles all 25 tickers internally (parallel search + curation)
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "news-orchestrator", "{}", "pending").run();
    }
    if (action === "trend") {
      await this_env.TREND_ORCHESTRATOR.fetch("https://internal/process-trend", { method: "POST", body: JSON.stringify(body) });
    }
    if (action === "gen") {
      await this_env.BETA_GEN_ORCHESTRATOR.fetch("https://internal/process-gen-orchestrator", { method: "POST", body: "{}" });
    }
    if (action === "trend_beta") {
      await this_env.BETA_TREND_ORCHESTRATOR.fetch("https://internal/process-trend-orchestrator", { method: "POST", body: "{}" });
    }
    if (action === "daily_macro") {
      const now = new Date().toISOString();
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "daily-macro-summarizer", "{}", "pending").run();
    }
    if (action === "macro_news") {
      const now = new Date().toISOString();
      const inputDate = body.date || now.slice(0, 10);
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "macro-news-summarizer", JSON.stringify({ date: inputDate }), "pending").run();
    }
    if (action === "macro_news_search") {
      // Call orchestrator directly and await (runs 5 parallel web searches, ~90s)
      // Don't start the job queue workflow — this is a standalone long-running call
      try {
        const macroRes = await this_env.MACRO_NEWS_ORCHESTRATOR.fetch("https://internal/process-macro-news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        const macroResult = await macroRes.json();
        return Response.json({ ok: true, macro_news: macroResult });
      } catch (err) {
        return Response.json({ ok: false, error: err.message });
      }
    }
    if (action === "daily_update") {
      const now = new Date().toISOString();
      const inputDate = body.date || now.slice(0, 10);

      // Clear all old jobs before starting fresh
      await this_env.DB.prepare(`DELETE FROM PROC_01_Job_queue WHERE status = 'done'`).run();
      await this_env.DB.prepare(`
        DELETE FROM PROC_01_Job_queue WHERE status IN ('pending', 'running')
      `).run();

      // 1) Queue news-orchestrator (single job handles all 25 tickers with parallel search + curation)
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "news-orchestrator", "{}", "pending").run();

      // 2) Queue daily_macro
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "daily-macro-summarizer", "{}", "pending").run();

      // 3) Queue trend_beta
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "beta-trend-orchestrator", "{}", "pending").run();

      // 4) Queue macro_news (old summarizer)
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "macro-news-summarizer", JSON.stringify({ date: inputDate }), "pending").run();

      // 5) Fire macro-news-orchestrator directly (parallel web search, ~90s)
      // This runs concurrently with the workflow — the workflow handles job queue items
      // while the orchestrator runs independently via service binding
      await this_env.MACRO_NEWS_ORCHESTRATOR.fetch("https://internal/process-macro-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }).catch(err => console.error("Macro news orchestrator error:", err.message));
    }
    const instanceId = `run-${Date.now()}`;
    await this_env.WORKFLOW.create({ id: instanceId });
    return Response.json({ ok: true, workflowId: instanceId });
  }
};
export {
  JobWorkflow,
  index_default as default
};
//# sourceMappingURL=index.js.map
