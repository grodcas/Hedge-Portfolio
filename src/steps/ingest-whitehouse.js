// src/steps/ingest-whitehouse.js - White House/FOMC ingestion step

import fs from "fs";
import path from "path";
import * as policyChecker from "../../validation/lib/policy_checker.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate White House/FOMC data
 */
export async function ingestWhitehouse(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(1);
  logger.log("WH", "Fetching White House news...");

  if (!config.skipIngestion) {
    await importScript("../../whitehouse/index.js", logger, "WH");
  }

  // Validate White House/FOMC
  const policyResults = await policyChecker.checkAllSources(false, (source, i, total) => {
    logger.updateStep(1, Math.round((i / total) * 100), source);
  });

  for (const r of policyResults) {
    const latestStr = r.latest ? r.latest.title?.substring(0, 40) : "[NO DATA]";
    logger.log("WH", `${r.source}: url:${r.checks.url ? "✓" : "✗"} fmt:${r.checks.format ? "✓" : "✗"} ${latestStr}`,
      r.checks.url && r.checks.format ? "ok" : "warn");
  }

  stepResult.validation = policyResults;
  logger.completeStep(1, policyResults.length);

  // Load WH JSON
  try {
    stepResult.data = JSON.parse(
      fs.readFileSync(path.join(BASE_DIR, "whitehouse/whitehouse_summary.json"), "utf8")
    );
    logger.log("WH", `Loaded whitehouse data`, "ok");
  } catch (err) {
    logger.log("WH", `Failed to load JSON: ${err.message}`, "warn");
  }

  return stepResult;
}

export default ingestWhitehouse;
