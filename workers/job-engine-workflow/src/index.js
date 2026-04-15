var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
import { WorkflowEntrypoint } from "cloudflare:workers";

// =========================================================
// PER-WORKER RETRY POLICY
// =========================================================
// AI-heavy workers make expensive paid API calls on every invocation.
// A Cloudflare retry would re-run the whole batch (25 tickers × GPT-4o-mini,
// 33 × gpt-5-mini, etc.), burning tokens on transient failures.
// These workers: retries = 0 (fail fast, skip, continue).
//
// Free-API workers and pure-math workers are cheap to retry and benefit
// from transient network error recovery.
// These workers: retries = 2 with a short delay.
//
// Unlisted workers default to retries = 0 (safe default).
var RETRY_POLICY = {
  // Free-API / pure-math workers — cheap to retry
  "price-fetcher":              { limit: 2, delay: "30 seconds" },
  "earnings-fetcher":           { limit: 2, delay: "30 seconds" },
  "probability-engine":         { limit: 2, delay: "5 seconds" },
  "event-attribution-engine":   { limit: 2, delay: "5 seconds" },
  // News funnel is AI-heavy but idempotent via BETA_12 row check —
  // one retry is safe and useful for transient Gemini/OpenAI errors.
  "news-funnel-orchestrator":   { limit: 1, delay: "30 seconds" },
  // Orchestrators that only queue sub-jobs (no AI calls themselves)
  "beta-trend-orchestrator":    { limit: 2, delay: "5 seconds" },
  "beta-gen-orchestrator":      { limit: 2, delay: "5 seconds" },
  "report-orchestrator":        { limit: 2, delay: "5 seconds" },
  "trend-orchestrator":         { limit: 2, delay: "5 seconds" },
  // Everything else (AI-heavy) defaults to { limit: 0 } below.
};

function retryConfigFor(worker) {
  return RETRY_POLICY[worker] || { limit: 0, delay: "5 seconds" };
}

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
      // Fetch all pending jobs in the current wave (including requires)
      const waveJobs = await step.do(`fetch-wave-${currentWave}-jobs`, async () => {
        const { results } = await this.env.DB.prepare(`
          SELECT id, worker, input, requires FROM PROC_01_Job_queue
          WHERE status = 'pending' AND wave = ?
          ORDER BY id
        `).bind(currentWave).all();
        return results || [];
      });

      console.log(`WAVE ${currentWave}: considering ${waveJobs.length} jobs`);

      // Resolve "requires" gates: check if each job's dependencies succeeded.
      // Mark jobs as 'skipped' if any required worker has failed or was itself skipped.
      const readyJobs = [];
      for (const job of waveJobs) {
        const requires = (job.requires || "").split(",").map(s => s.trim()).filter(Boolean);
        if (requires.length === 0) {
          readyJobs.push(job);
          continue;
        }

        // For each required worker, fetch its current status from earlier waves of this run
        const placeholders = requires.map(() => "?").join(",");
        const depResult = await step.do(`check-deps-${job.worker}-${job.id}`, async () => {
          const { results } = await this.env.DB.prepare(`
            SELECT worker, status FROM PROC_01_Job_queue
            WHERE worker IN (${placeholders}) AND wave < ?
            ORDER BY id DESC
          `).bind(...requires, currentWave).all();
          return results || [];
        });

        // Keep only the latest status per required worker
        const statusByWorker = {};
        for (const r of depResult) {
          if (!(r.worker in statusByWorker)) statusByWorker[r.worker] = r.status;
        }

        const failedDeps = requires.filter(r =>
          !statusByWorker[r] || !["done"].includes(statusByWorker[r])
        );

        if (failedDeps.length > 0) {
          console.log(`SKIP: ${job.worker} — missing/failed deps: ${failedDeps.join(",")}`);
          await step.do(`mark-skipped-${job.worker}-${job.id}`, async () => {
            await this.env.DB.prepare(
              "UPDATE PROC_01_Job_queue SET status='skipped', last_update=datetime('now') WHERE id=?"
            ).bind(job.id).run();
          });
        } else {
          readyJobs.push(job);
        }
      }

      console.log(`WAVE ${currentWave}: running ${readyJobs.length} jobs in parallel (${waveJobs.length - readyJobs.length} skipped)`);

      // Run all ready jobs in this wave in parallel via step.do fan-out.
      // CRITICAL: each step.do has its own retry config per worker, and the
      // inner catch swallows errors (marks failed but does NOT re-throw) so
      // one bad job does not halt the wave or the workflow.
      await Promise.all(
        readyJobs.map(job => {
          const retryConfig = retryConfigFor(job.worker);
          return step.do(
            `execute-${job.worker}-${job.id}`,
            { retries: retryConfig, timeout: "15 minutes" },
            async () => {
              console.log(`PROCESSING: ${job.worker} (ID: ${job.id}, wave ${currentWave}, retries=${retryConfig.limit})`);
              await this.env.DB.prepare(
                "UPDATE PROC_01_Job_queue SET status='running', last_update=datetime('now') WHERE id=?"
              ).bind(job.id).run();
              try {
                const res = await this.runJob(job.worker, job.input || "{}");
                if (!res.ok) {
                  const errText = await res.text();
                  throw new Error(`Worker ${job.worker} failed (${res.status}): ${errText.slice(0, 300)}`);
                }
                await this.env.DB.prepare(
                  "UPDATE PROC_01_Job_queue SET status='done', last_update=datetime('now') WHERE id=?"
                ).bind(job.id).run();
                console.log(`DONE: ${job.worker}`);
              } catch (err) {
                console.error(`FAILED: ${job.worker}`, err.message);
                await this.env.DB.prepare(
                  "UPDATE PROC_01_Job_queue SET status='failed', last_update=datetime('now') WHERE id=?"
                ).bind(job.id).run();
                // NOTE: we do NOT re-throw. Fail-forward — other wave jobs
                // continue, and the workflow advances to the next wave.
                // Dependents of this worker will be skipped via the
                // "requires" gate when their wave starts.
              }
            }
          );
        })
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
      // --- NEWS FUNNEL ---
      case "news-funnel-orchestrator":
        return await this.env.NEWS_FUNNEL_ORCHESTRATOR.fetch("https://internal/run-news-funnel", { method: "POST", body });
      // --- DATA FETCHERS ---
      case "price-fetcher":
        return await this.env.PRICE_FETCHER.fetch("https://internal/fetch-prices", { method: "POST", body });
      case "earnings-fetcher":
        return await this.env.EARNINGS_FETCHER.fetch("https://internal/fetch-earnings", { method: "POST", body });
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

      // Clear OLD daily_update jobs only — preserve auto-queued SEC processing
      // (waves 10/11/20 from report-orchestrator) and manual trend-orchestrator
      // jobs (wave 4500/5000), which are independent of the daily_update flow.
      await this_env.DB.prepare(`
        DELETE FROM PROC_01_Job_queue
        WHERE wave >= 1000 AND wave < 5000
          AND status IN ('done','pending','running','failed','skipped')
      `).run();

      // Wave-based parallelism. Jobs in the same wave run in parallel.
      // Wave numbers use base 1000 to leave room for orchestrator sub-chains
      // to insert intermediate waves between main waves.
      //
      // Wave 1000: data fetchers + AI synthesizers (independent, ~7 min bounded by price-fetcher)
      //   Wave 1100-1400: beta chain sub-jobs queued by beta-trend-orchestrator at runtime
      // Wave 2000: macro intelligence (needs news funnel + macro data)
      // Wave 3000: assessment + event-attribution (parallel; need prices + news)
      // Wave 4000: probability + consensus (parallel; need SIGNAL_01)

      const insertJob = async (worker, wave, requires = null, input = "{}") => {
        await this_env.DB.prepare(`
          INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave, requires)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(now, worker, input, "pending", wave, requires).run();
      };

      // Wave 1000 — data fetchers + news funnel (all independent)
      //   Note: fundamentals are fetched locally (Alpha Vantage IP rate-limits
      //   Cloudflare's shared egress pool). See src/steps/fetch-fundamentals.js.
      //   Local pipeline POSTs FUND_01 before triggering daily_update.
      await insertJob("price-fetcher", 1000);
      await insertJob("earnings-fetcher", 1000);
      await insertJob("beta-trend-orchestrator", 1000);
      await insertJob("news-funnel-orchestrator", 1000);

      // Wave 2000 — macro intelligence. Requires news funnel so that BETA_12
      //   is populated before macro-intel reads it. Without this gate, a
      //   failed news funnel would silently produce an empty-input intel blob.
      await insertJob("macro-intelligence-builder", 2000, "news-funnel-orchestrator");

      // Wave 3000 — assessment + event-attribution
      //   assessment-engine reads PRICE_01, FUND_02, FUND_03, BETA_10.
      //     Requires price-fetcher + earnings-fetcher + macro-intel to succeed.
      //   event-attribution-engine reads PRICE_01, BETA_12, ALPHA_01/03.
      //     Requires price-fetcher to succeed (events without prices = nothing to attribute).
      await insertJob("assessment-engine", 3000, "price-fetcher,earnings-fetcher,macro-intelligence-builder");
      await insertJob("event-attribution-engine", 3000, "price-fetcher");

      // Wave 4000 — probability + consensus (need SIGNAL_01 from assessment)
      await insertJob("probability-engine", 4000, "assessment-engine");
      await insertJob("consensus-validator", 4000, "assessment-engine");
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
