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

  // Load ingested SEC data for comparison - last 2 days (matching SEC checker lookback)
  // Filename format: TICKER_TYPE_DATE_clustered.json (e.g., AAPL_10-K_2025-10-31_clustered.json)
  let ingestedSEC = {};
  const today = new Date().toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  try {
    const edgarDir = path.join(BASE_DIR, "edgar/edgar_clustered_json");
    if (fs.existsSync(edgarDir)) {
      const files = fs.readdirSync(edgarDir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        // Only process properly named clustered files
        if (!file.endsWith("_clustered.json")) continue;

        // Parse filename: TICKER_TYPE_DATE_clustered.json or TICKER_TYPE_DATE_ACCESSION_clustered.json
        const parts = file.replace("_clustered.json", "").split("_");
        if (parts.length >= 3) {
          const ticker = parts[0];
          const type = parts[1]; // e.g., "10-K", "8-K", "4"
          const date = parts[2]; // e.g., "2025-10-31"
          // parts[3] is optional accession suffix

          // Validate date format (YYYY-MM-DD)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

          // Only include files from last 2 days (matching SEC API lookback)
          if (date < twoDaysAgo) continue;

          if (!ingestedSEC[ticker]) ingestedSEC[ticker] = [];
          ingestedSEC[ticker].push({ type, date });
        }
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
