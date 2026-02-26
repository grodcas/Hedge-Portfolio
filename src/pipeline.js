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
    // Step 1: Press Releases
    const pressResult = await ingestPress(config, logger, results);
    results.validation.press = pressResult.validation;
    results.ingestedData.press = pressResult.data;

    // Step 2: White House
    const whResult = await ingestWhitehouse(config, logger, results);
    results.validation.policy = whResult.validation;
    results.ingestedData.whitehouse = whResult.data;

    // Step 3: News
    const newsResult = await ingestNews(config, logger, results);
    results.validation.news = newsResult.validation;
    results.ingestedData.news = newsResult.data;

    // Step 4: SEC Edgar
    const edgarResult = await ingestEdgar(config, logger, results);
    results.validation.sec = { results: edgarResult.validation, comparison: edgarResult.comparison };
    results.ingestedData.sec = edgarResult.data;

    // Step 5: Macro
    const macroResult = await ingestMacro(config, logger, results);
    results.validation.macro = macroResult.validation;
    results.ingestedData.macro = macroResult.data;

    // Step 6: Sentiment
    const sentimentResult = await ingestSentiment(config, logger, results);
    results.validation.sentiment = sentimentResult.validation;
    results.ingestedData.sentiment = sentimentResult.data;

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
