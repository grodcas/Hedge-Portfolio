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
            // --- NEWS FUNNEL ---
            case "news-funnel-orchestrator":
              res = await this.env.NEWS_FUNNEL_ORCHESTRATOR.fetch("https://internal/run-news-funnel", { method: "POST", body });
              break;
            // --- DATA FETCHERS ---
            case "price-fetcher":
              res = await this.env.PRICE_FETCHER.fetch("https://internal/fetch-prices", { method: "POST", body });
              break;
            case "earnings-fetcher":
              res = await this.env.EARNINGS_FETCHER.fetch("https://internal/fetch-earnings", { method: "POST", body });
              break;
            case "fundamentals-fetcher":
              res = await this.env.FUNDAMENTALS_FETCHER.fetch("https://internal/fetch-fundamentals", { method: "POST", body });
              break;
            // --- SIGNAL LAYER ---
            case "macro-intelligence-builder":
              res = await this.env.MACRO_INTELLIGENCE_BUILDER.fetch("https://internal/build-macro-intelligence", { method: "POST", body });
              break;
            case "assessment-engine":
              res = await this.env.ASSESSMENT_ENGINE.fetch("https://internal/compute-assessments", { method: "POST", body });
              break;
            case "probability-engine":
              res = await this.env.PROBABILITY_ENGINE.fetch("https://internal/update-probabilities", { method: "POST", body });
              break;
            case "consensus-validator":
              res = await this.env.CONSENSUS_VALIDATOR.fetch("https://internal/validate-consensus", { method: "POST", body });
              break;
            case "event-attribution-engine":
              res = await this.env.EVENT_ATTRIBUTION_ENGINE.fetch("https://internal/attribute-events", { method: "POST", body });
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
      // Unified news worker handles ticker + macro + calendar in parallel
      try {
        const mode = body.mode || "deep";
        const newsRes = await this_env.NEWS_SEARCH_UNIFIED.fetch(`https://internal/run?mode=${mode}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        const newsResult = await newsRes.json();
        return Response.json({ ok: true, news: newsResult });
      } catch (err) {
        return Response.json({ ok: false, error: err.message });
      }
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
      // Handled by unified news worker now
      try {
        const newsRes = await this_env.NEWS_SEARCH_UNIFIED.fetch("https://internal/run?mode=deep", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        const newsResult = await newsRes.json();
        return Response.json({ ok: true, news: newsResult });
      } catch (err) {
        return Response.json({ ok: false, error: err.message });
      }
    }
    if (action === "fundamentals") {
      const now = new Date().toISOString();
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "fundamentals-fetcher", "{}", "pending").run();
    }
    if (action === "news_funnel") {
      const now = new Date().toISOString();
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "news-funnel-orchestrator", "{}", "pending").run();
    }
    if (action === "daily_update") {
      const now = new Date().toISOString();
      const inputDate = body.date || now.slice(0, 10);

      // Clear all old jobs before starting fresh
      await this_env.DB.prepare(`DELETE FROM PROC_01_Job_queue WHERE status = 'done'`).run();
      await this_env.DB.prepare(`
        DELETE FROM PROC_01_Job_queue WHERE status IN ('pending', 'running')
      `).run();

      // 1) Fire news funnel (RSS + Finnhub → GPT filter → Gemini summaries → D1)
      // Runs via service binding — does NOT go through job queue
      this_env.NEWS_FUNNEL_ORCHESTRATOR.fetch("https://internal/run-news-funnel", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      }).catch(err => console.error("News funnel error:", err.message));

      // Queue jobs in INSERT order (LIFO: last inserted = highest ID = runs first)
      // So we insert in REVERSE execution order:

      // 1) Signal layer (runs LAST — lowest IDs)
      // Execution order (LIFO-reversed): price → earnings → macro-news →
      //   beta-trend → macro-intel → event-attribution → assessment →
      //   probability → consensus
      // event-attribution moved earlier: it only reads PRICE_01, BETA_12,
      //   ALPHA_01, ALPHA_03 — doesn't need assessment output.
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "consensus-validator", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "probability-engine", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "assessment-engine", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "event-attribution-engine", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "macro-intelligence-builder", "{}", "pending").run();

      // 2) Queue AI summarizers (run AFTER data fetchers)
      // NOTE: daily-macro-summarizer dropped — macro-intelligence-builder supersedes it
      // (both wrote to BETA_10_Daily_macro, causing double-write)

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "beta-trend-orchestrator", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "macro-news-summarizer", JSON.stringify({ date: inputDate }), "pending").run();

      // 3) Queue data fetchers (run FIRST — highest IDs)
      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "earnings-fetcher", "{}", "pending").run();

      await this_env.DB.prepare(`
        INSERT INTO PROC_01_Job_queue (date, worker, input, status)
        VALUES (?, ?, ?, ?)
      `).bind(now, "price-fetcher", "{}", "pending").run();
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
