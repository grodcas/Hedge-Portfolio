// src/pipeline.js - Main pipeline orchestrator
// Modular pipeline that coordinates all ingestion and validation steps

import "dotenv/config";
import PipelineLogger from "../validation/lib/logger.js";
import * as calendar from "../validation/lib/calendar.js";
import { CONFIG } from "./lib/config.js";

// Import step modules
import { ingestPress } from "./steps/ingest-press.js";
import { ingestWhitehouse } from "./steps/ingest-whitehouse.js";
import { ingestNews } from "./steps/ingest-news.js";
import { ingestEdgar } from "./steps/ingest-edgar.js";
import { ingestMacro } from "./steps/ingest-macro.js";
import { ingestSentiment } from "./steps/ingest-sentiment.js";
import { fetchFundamentals } from "./steps/fetch-fundamentals.js";
import { upload } from "./steps/upload.js";
import { summarize } from "./steps/summarize.js";
import { verifyFacts, generateFactReport, uploadVerificationResults } from "./steps/verify-facts.js";
import { syncDashboard } from "./steps/sync-dashboard.js";

/**
 * Main pipeline execution
 */
async function main(options = {}) {
  // Merge options with default config
  const config = { ...CONFIG, ...options };

  // Initialize logger
  const logger = new PipelineLogger();
  const steps = [
    "Press Releases",
    "White House",
    "News",
    "SEC Edgar",
    "Macro",
    "Sentiment",
    "Upload + Workflow",
    "Validation",
    "Fact Verification",
    "Sync Dashboard"
  ];

  logger.init(steps, config.logDir);

  const results = {
    date: calendar.todayISO(),
    steps: {},
    validation: {},
    ingestedData: {}
  };

  let hasErrors = false;

  try {
    // Steps 1-6: Scrape all independent data sources in PARALLEL
    // These have no dependencies on each other — each hits a different
    // external source (company IR, WH, Edgar, BLS/FRED, CBOE/COT/AAII).
    // Running them sequentially wastes ~3 minutes; Promise.all bounds the
    // whole stage to the slowest single scraper (Edgar, ~90s).
    logger.log("PIPELINE", "Starting parallel scraping of 6 data sources...");
    const parallelStart = Date.now();

    const [pressResult, whResult, newsResult, edgarResult, macroResult, sentimentResult, fundResult] =
      await Promise.all([
        ingestPress(config, logger, results).catch(err => {
          logger.log("PRESS", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, error: err.message };
        }),
        ingestWhitehouse(config, logger, results).catch(err => {
          logger.log("WH", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, error: err.message };
        }),
        ingestNews(config, logger, results).catch(err => {
          logger.log("NEWS", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, error: err.message };
        }),
        ingestEdgar(config, logger, results).catch(err => {
          logger.log("EDGAR", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, comparison: null, error: err.message };
        }),
        ingestMacro(config, logger, results).catch(err => {
          logger.log("MACRO", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, error: err.message };
        }),
        ingestSentiment(config, logger, results).catch(err => {
          logger.log("SENTIMENT", `Step failed: ${err.message}`, "fail");
          return { data: null, validation: null, error: err.message };
        }),
        fetchFundamentals(config, logger, results).catch(err => {
          logger.log("FUNDAMENTALS", `Step failed: ${err.message}`, "fail");
          return { data: null, fetched: 0, errors: 0, error: err.message };
        }),
      ]);

    const parallelElapsed = ((Date.now() - parallelStart) / 1000).toFixed(1);
    logger.log("PIPELINE", `Parallel scraping complete in ${parallelElapsed}s`, "ok");

    results.validation.press = pressResult.validation;
    results.ingestedData.press = pressResult.data;
    results.validation.policy = whResult.validation;
    results.ingestedData.whitehouse = whResult.data;
    results.validation.news = newsResult.validation;
    results.ingestedData.news = newsResult.data;
    results.validation.sec = { results: edgarResult.validation, comparison: edgarResult.comparison };
    results.ingestedData.sec = edgarResult.data;
    results.validation.macro = macroResult.validation;
    results.ingestedData.macro = macroResult.data;
    results.validation.sentiment = sentimentResult.validation;
    results.ingestedData.sentiment = sentimentResult.data;
    results.ingestedData.fundamentalsMeta = { fetched: fundResult.fetched, errors: fundResult.errors };

    // Step 7: Upload
    const uploadResult = await upload(config, logger, results.ingestedData);
    hasErrors = uploadResult.hasErrors;

    // Step 8: Summarize
    const stepResults = {
      press: pressResult,
      whitehouse: whResult,
      news: newsResult,
      edgar: edgarResult,
      macro: macroResult,
      sentiment: sentimentResult,
      hasErrors
    };

    const summaryResult = await summarize(config, logger, stepResults);
    results.summary = summaryResult.summary;
    results.logFile = summaryResult.logFile;

    // Step 9: Fact Verification
    logger.startStep(8);
    logger.log("VERIFY", "Running AI fact verification on summaries...");
    try {
      const verifyResult = await verifyFacts(config, logger);
      results.factVerification = generateFactReport([verifyResult]);

      // Save verification results locally for dashboard
      const fs = await import("fs");
      const path = await import("path");
      const verifyPath = path.default.join(config.logDir, `verification_${calendar.todayISO()}.json`);
      fs.default.writeFileSync(verifyPath, JSON.stringify(results.factVerification, null, 2));

      // Upload individual verification results to D1 (per ticker, not aggregated)
      if (verifyResult.results && verifyResult.results.length > 0) {
        const uploadRes = await uploadVerificationResults(verifyResult.results);
        if (uploadRes.success) {
          logger.log("VERIFY", `Verification uploaded to D1 (${verifyResult.results.length} items)`, "ok");
        } else {
          logger.log("VERIFY", `D1 upload failed: ${uploadRes.error}`, "warn");
        }
      } else {
        logger.log("VERIFY", `No verification results to upload`, "warn");
      }

      logger.log("VERIFY", `Verification saved: ${verifyPath}`, "ok");
      logger.completeStep(8, verifyResult.totalChecked || 0,
        verifyResult.failed > 0 ? "warning" : "done");
    } catch (err) {
      logger.log("VERIFY", `Verification error: ${err.message}`, "fail");
      logger.completeStep(8, 0, "warning");
    }

    // Step 10: Sync Dashboard (poll workflow completion and cache data)
    if (!config.skipIngestion && uploadResult.workflowId) {
      const syncResult = await syncDashboard(config, logger, uploadResult.workflowId);
      results.dashboardSynced = syncResult.synced;
    }

  } catch (err) {
    console.error("Pipeline error:", err);
    hasErrors = true;
    results.error = err.message;
  } finally {
    logger.cleanup();
  }

  return results;
}

// Export for module use
export { main, CONFIG };

// Run if executed directly
main().catch(console.error);
