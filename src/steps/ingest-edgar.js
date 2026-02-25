// src/steps/ingest-edgar.js - SEC Edgar ingestion step

import fs from "fs";
import path from "path";
import * as secChecker from "../../validation/lib/sec-checker.js";
import * as calendar from "../../validation/lib/calendar.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate SEC filings
 */
export async function ingestEdgar(config, logger, results) {
  const stepResult = {
    validation: null,
    comparison: null,
    data: {},
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(3);
  logger.log("SEC", "Fetching SEC filings...");

  if (!config.skipIngestion) {
    await importScript("../../edgar/fetch.js", logger, "SEC");
  }

  // Run SEC validation checker
  logger.log("SEC", "Running SEC validation checker...");
  const secResults = await secChecker.checkAllTickers(2, (ticker, i, total) => {
    logger.updateStep(3, Math.round((i / total) * 100), ticker);
  });

  // Load ingested SEC data for comparison
  let ingestedSEC = {};
  try {
    const edgarDir = path.join(BASE_DIR, "edgar/edgar_clustered_json");
    if (fs.existsSync(edgarDir)) {
      const files = fs.readdirSync(edgarDir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(edgarDir, file), "utf8"));
        const ticker = data.ticker || file.split("_")[0];
        if (!ingestedSEC[ticker]) ingestedSEC[ticker] = [];
        ingestedSEC[ticker].push({ type: data.type, date: data.date });
      }
    }
  } catch (err) {
    logger.log("SEC", `Error loading ingested SEC: ${err.message}`, "warn");
  }

  // Compare and log
  const comparison = secChecker.compareWithIngested(secResults, ingestedSEC);
  logger.printSECTable(comparison.map(c => ({
    ...c,
    calendar: calendar.hasExpectedFiling(c.ticker)
  })));

  for (const row of comparison) {
    if (!row.match) {
      stepResult.hasWarnings = true;
      stepResult.actionRequired.push(`${row.ticker}: SEC mismatch (ingested: ${row.ingestor}, API: ${row.secCheck})`);
    }
  }

  stepResult.validation = secResults;
  stepResult.comparison = comparison;
  stepResult.data = ingestedSEC;

  const secSummary = secChecker.getSummary(secResults);
  const secMatches = comparison.filter(r => r.match).length;
  logger.completeStep(3, secSummary.totalFilings, secMatches === comparison.length ? "done" : "warning");

  return stepResult;
}

export default ingestEdgar;
