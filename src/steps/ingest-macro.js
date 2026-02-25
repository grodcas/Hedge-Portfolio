// src/steps/ingest-macro.js - Macro indicators ingestion step

import fs from "fs";
import path from "path";
import * as macroChecker from "../../validation/lib/macro_checker.js";
import * as calendar from "../../validation/lib/calendar.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate macro indicators
 */
export async function ingestMacro(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(4);
  logger.log("MACRO", "Fetching macro indicators...");

  if (!config.skipIngestion) {
    await importScript("../../macro/index.js", logger, "MACRO");
  }

  // Validate macro
  const macroResults = await macroChecker.checkAllIndicators((indicator, i, total) => {
    logger.updateStep(4, Math.round((i / total) * 100), indicator);
  });

  const macroTableData = macroResults.map(r => ({
    indicator: r.indicator,
    calendarFlag: calendar.hasIndicatorRelease(r.indicator),
    checks: r.checks,
    value: r.value
  }));
  logger.printMacroTable(macroTableData);

  for (const row of macroTableData) {
    if (!row.checks.url || !row.checks.format || !row.checks.data) {
      stepResult.hasWarnings = true;
      const failed = Object.entries(row.checks).filter(([k, v]) => !v).map(([k]) => k);
      stepResult.actionRequired.push(`${row.indicator}: Failed (${failed.join(", ")})`);
    }
  }

  stepResult.validation = macroResults;
  const macroOk = macroResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
  logger.completeStep(4, macroResults.length, macroOk === macroResults.length ? "done" : "warning");

  // Load macro JSON
  try {
    stepResult.data = JSON.parse(
      fs.readFileSync(path.join(BASE_DIR, "macro/macro_summary.json"), "utf8")
    );
    logger.log("MACRO", `Loaded ${stepResult.data.Macro?.length || 0} indicators`, "ok");
  } catch (err) {
    logger.log("MACRO", `Failed to load JSON: ${err.message}`, "warn");
  }

  return stepResult;
}

export default ingestMacro;
