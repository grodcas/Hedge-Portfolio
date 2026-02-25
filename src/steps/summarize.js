// src/steps/summarize.js - Final validation summary

import fs from "fs";
import path from "path";
import * as newsChecker from "../../validation/lib/news_checker.js";
import * as calendar from "../../validation/lib/calendar.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Generate final validation summary
 */
export async function summarize(config, logger, stepResults) {
  logger.startStep(7);
  logger.updateStep(7, 100, "Complete");

  const { press, whitehouse, news, edgar, macro, sentiment } = stepResults;

  // Collect all action required items
  const actionRequired = [
    ...(press?.actionRequired || []),
    ...(whitehouse?.actionRequired || []),
    ...(news?.actionRequired || []),
    ...(edgar?.actionRequired || []),
    ...(macro?.actionRequired || []),
    ...(sentiment?.actionRequired || [])
  ];

  // Calculate pass counts
  const macroOk = macro?.validation?.filter(r => r.checks.url && r.checks.format && r.checks.data).length || 0;
  const sentOk = sentiment?.validation?.filter(r => r.checks.url && r.checks.format && r.checks.data).length || 0;
  const secMatches = edgar?.comparison?.filter(r => r.match).length || 0;

  const summary = {
    hasErrors: stepResults.hasErrors || false,
    hasWarnings: press?.hasWarnings || whitehouse?.hasWarnings || news?.hasWarnings ||
                 edgar?.hasWarnings || macro?.hasWarnings || sentiment?.hasWarnings,
    sections: {
      "SEC Edgar": {
        total: edgar?.comparison?.length || 0,
        passed: secMatches,
        failed: (edgar?.comparison?.length || 0) - secMatches,
        issues: edgar?.comparison?.filter(r => !r.match).map(r => r.ticker).join(", ") || ""
      },
      "Macro": {
        total: macro?.validation?.length || 0,
        passed: macroOk,
        failed: (macro?.validation?.length || 0) - macroOk,
        issues: macro?.validation?.filter(r => !r.checks.data).map(r => r.indicator).join(", ") || ""
      },
      "Sentiment": {
        total: sentiment?.validation?.length || 0,
        passed: sentOk,
        failed: (sentiment?.validation?.length || 0) - sentOk
      },
      "Press Releases": {
        total: press?.validation?.length || 0,
        passed: press?.validation?.filter(r => r.checks.url && r.checks.format).length || 0,
        failed: press?.validation?.filter(r => !r.checks.format).length || 0
      },
      "WH/FOMC": {
        total: whitehouse?.validation?.length || 0,
        passed: whitehouse?.validation?.filter(r => r.checks.url && r.checks.format).length || 0,
        failed: whitehouse?.validation?.filter(r => !r.checks.format).length || 0
      },
      "News": {
        total: newsChecker.getSummary(news?.validation || []).totalArticles,
        passed: newsChecker.getSummary(news?.validation || []).aiPassed,
        failed: newsChecker.getSummary(news?.validation || []).failed?.length || 0
      }
    },
    calendarEvents: calendar.getTodaysSummary().macro.map(e => ({
      name: e,
      confirmed: true
    })),
    actionRequired
  };

  logger.printFinalSummary(summary);
  logger.completeStep(7, 0);

  // Save results
  const logFile = logger.save();

  // Save dashboard data
  const dashboardData = {
    date: calendar.todayISO(),
    validation: {
      press: press?.validation,
      policy: whitehouse?.validation,
      news: news?.validation,
      sec: { results: edgar?.validation, comparison: edgar?.comparison },
      macro: macro?.validation,
      sentiment: sentiment?.validation
    },
    summary,
    calendar: calendar.getTodaysSummary()
  };

  fs.writeFileSync(
    path.join(config.logDir, `dashboard_${calendar.todayISO()}.json`),
    JSON.stringify(dashboardData, null, 2)
  );

  logger.log("DONE", `Dashboard data saved`, "ok");

  return { summary, logFile, dashboardData };
}

export default summarize;
