// validation/runner.js - Main validation orchestrator
// Runs all validation checks and produces comprehensive report

import "dotenv/config";
import fs from "fs";
import path from "path";

import PipelineLogger from "./lib/logger.js";
import * as secChecker from "./lib/sec_checker.js";
import * as secScanner from "./lib/sec_ingest_scanner.js";
import * as macroChecker from "./lib/macro_checker.js";
import * as sentimentChecker from "./lib/sentiment_checker.js";
import * as pressChecker from "./lib/press_checker.js";
import * as newsChecker from "./lib/news_checker.js";
import * as policyChecker from "./lib/policy_checker.js";
import * as calendar from "./lib/calendar.js";

/**
 * Run full validation suite
 * @param {Object} options - Configuration options
 * @param {Object} ingestedData - Data from ingestion pipeline to compare against
 * @returns {Promise<Object>} - Validation results
 */
async function runValidation(options = {}, ingestedData = {}) {
  const {
    useAI = true,          // Use AI for article validation
    skipSEC = false,
    skipMacro = false,
    skipSentiment = false,
    skipPress = false,
    skipNews = false,
    secLookbackDays = 2,   // Days to look back for SEC comparison
    skipPolicy = false,
    logDir = "C:\\AI_agent\\HF\\logs"
  } = options;

  // Initialize logger
  const logger = new PipelineLogger();
  const steps = [
    "SEC Edgar",
    "Macro Indicators",
    "Sentiment",
    "Press Releases",
    "White House/FOMC",
    "News"
  ];

  logger.init(steps, logDir);

  const results = {
    date: calendar.todayISO(),
    calendar: calendar.getTodaysSummary(),
    sec: null,
    macro: null,
    sentiment: null,
    press: null,
    policy: null,
    news: null,
    summary: null
  };

  const actionRequired = [];
  let hasErrors = false;
  let hasWarnings = false;

  try {
    // ============ AUTO-LOAD INGESTED SEC DATA ============
    // If no SEC data provided, scan local edgar folders to find what's been ingested
    if (!ingestedData.sec || Object.keys(ingestedData.sec).length === 0) {
      logger.log("SEC", "Scanning local edgar folders for ingested filings...");
      ingestedData.sec = secScanner.getRecentIngestedFilings(secLookbackDays);
      const summary = secScanner.getIngestedSummary(ingestedData.sec);
      logger.log("SEC", `Found ${summary.totalFilings} ingested filings (${summary.tickerCount} tickers)`, "ok");
    }

    // ============ STEP 1: SEC EDGAR ============
    if (!skipSEC) {
      logger.startStep(0);
      logger.log("SEC", "Starting SEC EDGAR validation...");

      const secResults = await secChecker.checkAllTickers(secLookbackDays, (ticker, i, total) => {
        logger.updateStep(0, Math.round((i / total) * 100), ticker);
      });

      // Compare with ingested data
      const comparison = secChecker.compareWithIngested(secResults, ingestedData.sec || {});

      // Print table
      logger.printSECTable(comparison.map(c => ({
        ...c,
        calendar: calendar.hasExpectedFiling(c.ticker)
      })));

      // Log individual results
      for (const row of comparison) {
        logger.logSECValidation(
          row.ticker,
          calendar.hasExpectedFiling(row.ticker),
          row.ingestor,
          row.secCheck,
          row.match,
          row.newFilings
        );

        if (!row.match) {
          hasWarnings = true;
          actionRequired.push(`${row.ticker}: SEC mismatch (ingested: ${row.ingestor}, found: ${row.secCheck})`);
        }
      }

      const secSummary = secChecker.getSummary(secResults);
      results.sec = { results: secResults, comparison, summary: secSummary };

      // Ensure SEC validation data is stored in log data directly
      // (in case logSECValidation doesn't persist properly)
      if (!logger.logData.validations.SEC) {
        logger.logData.validations.SEC = {};
      }
      for (const row of comparison) {
        logger.logData.validations.SEC[row.ticker] = {
          calendar: calendar.hasExpectedFiling(row.ticker) || '',
          ingestor: row.ingestor || '-',
          secCheck: row.secCheck || '-',
          match: row.match,
          newFilings: row.newFilings || '-'
        };
      }

      const matches = comparison.filter(r => r.match).length;
      logger.completeStep(0, secSummary.totalFilings, matches === comparison.length ? "done" : "warning");
    } else {
      logger.completeStep(0, 0, "done");
    }

    // ============ STEP 2: MACRO INDICATORS ============
    if (!skipMacro) {
      logger.startStep(1);
      logger.log("MACRO", "Starting macro indicator validation...");

      const macroResults = await macroChecker.checkAllIndicators((indicator, i, total) => {
        logger.updateStep(1, Math.round((i / total) * 100), indicator);
      });

      // Print table
      const macroTableData = macroResults.map(r => ({
        indicator: r.indicator,
        calendarFlag: calendar.hasIndicatorRelease(r.indicator),
        checks: r.checks,
        value: r.value
      }));
      logger.printMacroTable(macroTableData);

      // Log individual results
      for (const row of macroTableData) {
        logger.logMacroValidation(row.indicator, row.calendarFlag, row.checks, row.value);

        if (!row.checks.url || !row.checks.format || !row.checks.data) {
          hasWarnings = true;
          const failed = Object.entries(row.checks).filter(([k, v]) => !v).map(([k]) => k);
          actionRequired.push(`${row.indicator}: Failed checks (${failed.join(", ")})`);
        }
      }

      results.macro = macroResults;
      const passed = macroResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
      logger.completeStep(1, macroResults.length, passed === macroResults.length ? "done" : "warning");
    } else {
      logger.completeStep(1, 0, "done");
    }

    // ============ STEP 3: SENTIMENT ============
    if (!skipSentiment) {
      logger.startStep(2);
      logger.log("SENTIMENT", "Starting sentiment indicator validation...");

      const sentimentResults = await sentimentChecker.checkAllIndicators((indicator, i, total) => {
        logger.updateStep(2, Math.round((i / total) * 100), indicator);
      });

      // Log results
      for (const r of sentimentResults) {
        const calFlag = calendar.getEventsForDate().sentiment.some(
          e => e.event.toLowerCase().includes(r.indicator.toLowerCase().split(" ")[0])
        );
        logger.logMacroValidation(r.indicator, calFlag, r.checks, r.value);

        if (!r.checks.url || !r.checks.format || !r.checks.data) {
          hasWarnings = true;
        }
      }

      results.sentiment = sentimentResults;
      const passed = sentimentResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
      logger.completeStep(2, sentimentResults.length, passed === sentimentResults.length ? "done" : "warning");
    } else {
      logger.completeStep(2, 0, "done");
    }

    // ============ STEP 4: PRESS RELEASES ============
    if (!skipPress) {
      logger.startStep(3);
      logger.log("PRESS", "Starting press release validation...");

      const pressResults = await pressChecker.checkAllTickers(useAI, (ticker, i, total) => {
        logger.updateStep(3, Math.round((i / total) * 100), ticker);
      });

      // Log results
      for (const r of pressResults) {
        logger.logPressValidation(r.ticker, r.checks, r.latest);

        if (!r.checks.discovery || !r.checks.content) {
          hasWarnings = true;
          const stage = !r.checks.discovery ? "discovery" : "content";
          actionRequired.push(`${r.ticker}: Press parser ${stage} failed - ${r.error || "unknown"}`);
        }
      }

      results.press = pressResults;
      const pressSummary = pressChecker.getSummary(pressResults);
      logger.completeStep(3, pressResults.length, pressSummary.allPassed === pressResults.length ? "done" : "warning");
    } else {
      logger.completeStep(3, 0, "done");
    }

    // ============ STEP 5: WHITE HOUSE / FOMC ============
    if (!skipPolicy) {
      logger.startStep(4);
      logger.log("POLICY", "Starting policy source validation...");

      const policyResults = await policyChecker.checkAllSources(useAI, (source, i, total) => {
        logger.updateStep(4, Math.round((i / total) * 100), source);
      });

      // Log results
      for (const r of policyResults) {
        const calIcon = r.calendarFlag ? "●" : " ";
        const latestStr = r.latest ? `${r.latest.title?.substring(0, 40)}...` : "[NO DATA]";
        logger.log(
          "POLICY",
          `${calIcon} ${r.source.padEnd(15)} url:${r.checks.url ? "✓" : "✗"} fmt:${r.checks.format ? "✓" : "✗"} txt:${r.checks.text ? "✓" : "✗"} ai:${r.checks.ai ? "✓" : "✗"} ${latestStr}`,
          r.checks.url && r.checks.format && r.checks.text ? "ok" : "warn"
        );

        if (!r.checks.url || !r.checks.format) {
          hasWarnings = true;
        }
      }

      results.policy = policyResults;
      const policySummary = policyChecker.getSummary(policyResults);
      logger.completeStep(4, policyResults.length, policySummary.passed === policyResults.length ? "done" : "warning");
    } else {
      logger.completeStep(4, 0, "done");
    }

    // ============ STEP 6: NEWS ============
    if (!skipNews) {
      logger.startStep(5);
      logger.log("NEWS", "Starting news validation...");

      const newsResults = await newsChecker.checkAllSources(useAI, (source, i, total) => {
        logger.updateStep(5, Math.round((i / total) * 100), source);
      });

      // Log results
      for (const r of newsResults) {
        logger.logNewsValidation(r.source, r.checks, r.articleCount, r.tickers);

        if (r.failedArticles && r.failedArticles.length > 0) {
          hasWarnings = true;
          for (const f of r.failedArticles.slice(0, 2)) {
            logger.log("NEWS", `  Failed: ${f.file} - ${f.reason}`, "warn");
          }
        }
      }

      results.news = newsResults;
      const newsSummary = newsChecker.getSummary(newsResults);
      logger.completeStep(5, newsSummary.totalArticles, newsSummary.aiPassed === newsSummary.totalArticles ? "done" : "warning");
    } else {
      logger.completeStep(5, 0, "done");
    }

    // ============ FINAL SUMMARY ============
    const summary = {
      hasErrors,
      hasWarnings,
      sections: {
        "SEC Edgar": {
          total: results.sec?.comparison?.length || 0,
          passed: results.sec?.comparison?.filter(r => r.match).length || 0,
          failed: results.sec?.comparison?.filter(r => !r.match).length || 0,
          issues: results.sec?.comparison?.filter(r => !r.match).map(r => r.ticker).join(", ")
        },
        "Macro": {
          total: results.macro?.length || 0,
          passed: results.macro?.filter(r => r.checks.url && r.checks.format && r.checks.data).length || 0,
          failed: results.macro?.filter(r => !r.checks.url || !r.checks.format || !r.checks.data).length || 0,
          issues: results.macro?.filter(r => !r.checks.data).map(r => r.indicator).join(", ")
        },
        "Sentiment": {
          total: results.sentiment?.length || 0,
          passed: results.sentiment?.filter(r => r.checks.url && r.checks.format && r.checks.data).length || 0,
          failed: results.sentiment?.filter(r => !r.checks.data).length || 0
        },
        "Press Releases": {
          total: results.press?.length || 0,
          passed: results.press?.filter(r => r.checks.discovery && r.checks.content).length || 0,
          failed: results.press?.filter(r => !r.checks.discovery || !r.checks.content).length || 0,
          issues: results.press?.filter(r => !r.checks.discovery || !r.checks.content).map(r => `${r.ticker}(${r.error || "?"})`).join(", ")
        },
        "WH/FOMC": {
          total: results.policy?.length || 0,
          passed: results.policy?.filter(r => r.checks.url && r.checks.format && r.checks.text).length || 0,
          failed: results.policy?.filter(r => !r.checks.format).length || 0
        },
        "News": {
          total: newsChecker.getSummary(results.news || []).totalArticles,
          passed: newsChecker.getSummary(results.news || []).aiPassed,
          failed: newsChecker.getSummary(results.news || []).totalArticles - newsChecker.getSummary(results.news || []).aiPassed,
          issues: newsChecker.getSummary(results.news || []).failed?.slice(0, 3).map(f => f.file).join(", ")
        }
      },
      calendarEvents: [
        ...results.calendar.macro.map(e => ({ name: e, confirmed: true })),
        ...results.calendar.sec.map(e => ({ name: e, confirmed: true }))
      ],
      actionRequired
    };

    results.summary = summary;
    logger.printFinalSummary(summary);

    // Save log
    const logFile = logger.save();
    results.logFile = logFile;

  } catch (err) {
    logger.log("ERROR", `Validation failed: ${err.message}`, "fail");
    hasErrors = true;
    results.error = err.message;
  } finally {
    logger.cleanup();
  }

  return results;
}

/**
 * Run validation as standalone script
 */
async function main() {
  console.log("Starting validation...\n");

  const results = await runValidation({
    useAI: true,      // AI article validation enabled
    skipSEC: false,
    skipMacro: false,
    skipSentiment: false,
    skipPress: false,
    skipNews: true,   // Skip news (requires manual HTML download)
    skipPolicy: false
  });

  console.log("\nValidation complete.");
  console.log(`Log file: ${results.logFile}`);
}

// Run if called directly
if (process.argv[1].includes("runner.js")) {
  main().catch(console.error);
}

export { runValidation };
