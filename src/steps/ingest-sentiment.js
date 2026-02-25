// src/steps/ingest-sentiment.js - Sentiment indicators ingestion step

import fs from "fs";
import path from "path";
import * as sentimentChecker from "../../validation/lib/sentiment-checker.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate sentiment indicators
 */
export async function ingestSentiment(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(5);
  logger.log("SENTIMENT", "Fetching sentiment indicators...");

  if (!config.skipIngestion) {
    await importScript("../../sentiment/index.js", logger, "SENTIMENT");
  }

  // Validate sentiment
  const sentimentResults = await sentimentChecker.checkAllIndicators((indicator, i, total) => {
    logger.updateStep(5, Math.round((i / total) * 100), indicator);
  });

  for (const r of sentimentResults) {
    logger.logMacroValidation(r.indicator, false, r.checks, r.value);
  }

  stepResult.validation = sentimentResults;
  const sentOk = sentimentResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
  logger.completeStep(5, sentimentResults.length, sentOk === sentimentResults.length ? "done" : "warning");

  // Load sentiment JSON
  try {
    stepResult.data = JSON.parse(
      fs.readFileSync(path.join(BASE_DIR, "sentiment/sentiment_summary.json"), "utf8")
    );
    logger.log("SENTIMENT", `Loaded sentiment data`, "ok");
  } catch (err) {
    logger.log("SENTIMENT", `Failed to load JSON: ${err.message}`, "warn");
  }

  return stepResult;
}

export default ingestSentiment;
