// src/steps/ingest-press.js - Press release ingestion step

import fs from "fs";
import path from "path";
import * as pressChecker from "../../validation/lib/press-checker.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate press releases
 * @param {Object} config - Pipeline configuration
 * @param {Object} logger - Pipeline logger instance
 * @param {Object} results - Results object to populate
 * @returns {Object} - Step results with validation data
 */
export async function ingestPress(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(0);
  logger.log("PRESS", "Fetching press releases...");

  // Run scrapers
  if (!config.skipIngestion) {
    await importScript("../../press/index.js", logger, "PRESS");
    await importScript("../../press/summary.js", logger, "PRESS");
  }

  // Validate press release parsing
  if (config.validatePress) {
    logger.log("PRESS", "Validating press release pages...");
    const pressResults = await pressChecker.checkAllTickers(config.useAI, (ticker, i, total) => {
      logger.updateStep(0, Math.round((i / total) * 100), ticker);
    });

    // Log validation results
    let pressOk = 0;
    for (const r of pressResults) {
      logger.logPressValidation(r.ticker, r.checks, r.latest);
      if (r.checks.discovery && r.checks.content) {
        pressOk++;
      } else {
        stepResult.hasWarnings = true;
        if (!r.checks.discovery) {
          stepResult.actionRequired.push(`${r.ticker}: Press discovery failed`);
        } else if (!r.checks.content) {
          stepResult.actionRequired.push(`${r.ticker}: Press content extraction failed`);
        }
      }
    }

    stepResult.validation = pressResults;
    logger.completeStep(0, pressResults.length, pressOk === pressResults.length ? "done" : "warning");
  } else {
    logger.completeStep(0, 0, "done");
  }

  // Load press JSON
  try {
    stepResult.data = JSON.parse(
      fs.readFileSync(path.join(BASE_DIR, "press/AA_press_summary.json"), "utf8")
    );
    logger.log("PRESS", `Loaded ${Object.keys(stepResult.data).length} tickers`, "ok");
  } catch (err) {
    logger.log("PRESS", `Failed to load JSON: ${err.message}`, "warn");
  }

  return stepResult;
}

export default ingestPress;
