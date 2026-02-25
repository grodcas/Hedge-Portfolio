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
    "Upload Data",
    "Validation"
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
