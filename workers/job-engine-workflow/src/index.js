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
      // Find the lowest wave that still has pending jobs
      const waveRow = await step.do("fetch-next-wave", async () => {
        return await this.env.DB.prepare(`
          SELECT MIN(wave) AS w FROM PROC_01_Job_queue WHERE status = 'pending'
        `).first();
      });

      if (waveRow?.w == null) {
        console.log("QUEUE EMPTY - FINISHING");
        await step.do("write-completion-flag", async () => {
          await this.env.DB.prepare(`
            INSERT INTO PROC_02_Workflow_status (id, status, completed_at)
            VALUES ('latest', 'done', datetime('now'))
            ON CONFLICT(id) DO UPDATE SET status='done', completed_at=datetime('now')
          `).run();
        });
        break;
      }

      const currentWave = waveRow.w;
      // Fetch all pending jobs in the current wave
      const waveJobs = await step.do(`fetch-wave-${currentWave}-jobs`, async () => {
        const { results } = await this.env.DB.prepare(`
          SELECT id, worker, input FROM PROC_01_Job_queue
          WHERE status = 'pending' AND wave = ?
          ORDER BY id
        `).bind(currentWave).all();
        return results || [];
      });

      console.log(`WAVE ${currentWave}: running ${waveJobs.length} jobs in parallel`);

      // Run all jobs in this wave in parallel via step.do fan-out
      await Promise.all(
        waveJobs.map(job =>
          step.do(`execute-${job.worker}-${job.id}`, async () => {
            console.log(`PROCESSING: ${job.worker} (ID: ${job.id}, wave ${currentWave})`);
            await this.env.DB.prepare("UPDATE PROC_01_Job_queue SET status='running', last_update=datetime('now') WHERE id=?").bind(job.id).run();
            try {
              const res = await this.runJob(job.worker, job.input || "{}");
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
          })
        )
      );
    }
  }

  async runJob(worker, body) {
    switch (worker) {
      // --- BETA PROCESSORS ---
      case "beta-macro-processor":
        return await this.env.beta_macro_processor.fetch("https://internal/process-macro", { method: "POST", body });
      case "beta-sentiment-processor":
        return await this.env.beta_sentiment_processor.fetch("https://internal/process-sentiment", { method: "POST", body });
      case "beta-gen-processor":
        return await this.env.beta_gen_processor.fetch("https://internal/process-gen", { method: "POST", body });
      case "beta-trend-processor":
        return await this.env.beta_trend_processor.fetch("https://internal/process-trend", { method: "POST", body });
      // --- BETA ORCHESTRATORS ---
      case "beta-gen-orchestrator":
        return await this.env.BETA_GEN_ORCHESTRATOR.fetch("https://internal/process-gen-orchestrator", { method: "POST", body });
      case "beta-trend-orchestrator":
        return await this.env.BETA_TREND_ORCHESTRATOR.fetch("https://internal/process-trend-orchestrator", { method: "POST", body });
      // --- ALPHA ORCHESTRATORS ---
      case "report-orchestrator":
        return await this.env.REPORT_ORCHESTRATOR.fetch("https://internal/process-report", { method: "POST", body });
      case "trend-orchestrator":
        return await this.env.TREND_ORCHESTRATOR.fetch("https://internal/process-trend", { method: "POST", body });
      // --- SUMMARIZERS & BUILDERS ---
      case "form4-summarizer":
        return await this.env.form4_summarizer.fetch("https://internal/summarize-form4", { method: "POST", body });
      case "8k-summarizer":
        return await this.env.eightk_summarizer.fetch("https://internal/summarize-8k", { method: "POST", body });
      case "qk-cluster-summarizer":
        return await this.env.qk_cluster_summarizer.fetch("https://internal/summarize-cluster", { method: "POST", body });
      case "qk-structure-builder":
        return await this.env.qk_structure_builder.fetch("https://internal/build-structure", { method: "POST", body });
      case "qk-report-summarizer":
        return await this.env.qk_report_summarizer.fetch("https://internal/summarize-report", { method: "POST", body });
      case "trend-builder":
        return await this.env.trend_builder.fetch("https://internal/build-trend", { method: "POST", body });
      case "daily-macro-summarizer":
        return await this.env.DAILY_MACRO_SUMMARIZER.fetch("https://internal/process-daily-macro", { method: "POST", body });
      // --- NEWS FUNNEL ---
      case "news-funnel-orchestrator":
        return await this.env.NEWS_FUNNEL_ORCHESTRATOR.fetch("https://internal/run-news-funnel", { method: "POST", body });
      // --- DATA FETCHERS ---
      case "price-fetcher":
        return await this.env.PRICE_FETCHER.fetch("https://internal/fetch-prices", { method: "POST", body });
      case "earnings-fetcher":
        return await this.env.EARNINGS_FETCHER.fetch("https://internal/fetch-earnings", { method: "POST", body });
      case "fundamentals-fetcher":
        return await this.env.FUNDAMENTALS_FETCHER.fetch("https://internal/fetch-fundamentals", { method: "POST", body });
      // --- SIGNAL LAYER ---
      case "macro-intelligence-builder":
        return await this.env.MACRO_INTELLIGENCE_BUILDER.fetch("https://internal/build-macro-intelligence", { method: "POST", body });
      case "assessment-engine":
        return await this.env.ASSESSMENT_ENGINE.fetch("https://internal/compute-assessments", { method: "POST", body });
      case "probability-engine":
        return await this.env.PROBABILITY_ENGINE.fetch("https://internal/update-probabilities", { method: "POST", body });
      case "consensus-validator":
        return await this.env.CONSENSUS_VALIDATOR.fetch("https://internal/validate-consensus", { method: "POST", body });
      case "event-attribution-engine":
        return await this.env.EVENT_ATTRIBUTION_ENGINE.fetch("https://internal/attribute-events", { method: "POST", body });
      default:
        throw new Error(`Unknown worker: ${worker}`);
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

      // Wave-based parallelism. Jobs in the same wave run in parallel.
      // Wave numbers use base 1000 to leave room for orchestrator sub-chains
      // to insert intermediate waves between main waves.
      //
      // Wave 1000: data fetchers + AI synthesizers (independent, ~7 min bounded by price-fetcher)
      //   Wave 1100-1400: beta chain sub-jobs queued by beta-trend-orchestrator at runtime
      // Wave 2000: macro intelligence (needs news funnel + macro data)
      // Wave 3000: assessment + event-attribution (parallel; need prices + news)
      // Wave 4000: probability + consensus (parallel; need SIGNAL_01)

      const insertJob = async (worker, wave, input = "{}") => {
        await this_env.DB.prepare(`
          INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
          VALUES (?, ?, ?, ?, ?)
        `).bind(now, worker, input, "pending", wave).run();
      };

      // Wave 1000 — data fetchers + AI synthesizers (~7 min bounded by price-fetcher)
      // All data fetchers run in parallel; they hit independent external APIs
      // and each has its own idempotency/rate-limit protection.
      await insertJob("fundamentals-fetcher", 1000);
      await insertJob("price-fetcher", 1000);
      await insertJob("earnings-fetcher", 1000);
      await insertJob("beta-trend-orchestrator", 1000);

      // Wave 2000 — macro intelligence
      await insertJob("macro-intelligence-builder", 2000);

      // Wave 3000 — assessment + event-attribution
      await insertJob("assessment-engine", 3000);
      await insertJob("event-attribution-engine", 3000);

      // Wave 4000 — probability + consensus
      await insertJob("probability-engine", 4000);
      await insertJob("consensus-validator", 4000);
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
