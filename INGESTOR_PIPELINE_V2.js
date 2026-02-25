// INGESTOR_PIPELINE_V2.js - Enhanced ingestion pipeline with validation
// Wraps original pipeline with comprehensive logging and validation checks

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import PipelineLogger from "./validation/lib/logger.js";
import * as secChecker from "./validation/lib/sec_checker.js";
import * as macroChecker from "./validation/lib/macro_checker.js";
import * as sentimentChecker from "./validation/lib/sentiment_checker.js";
import * as pressChecker from "./validation/lib/press_checker.js";
import * as newsChecker from "./validation/lib/news_checker.js";
import * as policyChecker from "./validation/lib/policy_checker.js";
import * as calendar from "./validation/lib/calendar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  useAI: true,              // Use AI for article validation (costs money)
  validatePress: true,      // Run press release validation
  validateNews: true,       // Run news validation
  skipIngestion: false,     // Skip actual ingestion (validation only)
  logDir: path.join(__dirname, "logs")
};

// Ingestion endpoints
const INGEST_BASE = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

/**
 * Run a step with error handling
 */
async function runStep(name, fn, logger) {
  try {
    const result = await fn();
    return { success: true, result };
  } catch (err) {
    logger.log(name, `Error: ${err.message}`, "fail");
    return { success: false, error: err.message };
  }
}

/**
 * Import and run ingestion script
 */
async function importScript(scriptPath, logger, stepName) {
  try {
    await import(scriptPath);
    return { success: true };
  } catch (err) {
    logger.log(stepName, `Import error: ${err.message}`, "fail");
    return { success: false, error: err.message };
  }
}

/**
 * Main pipeline
 */
async function main() {
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

  logger.init(steps, CONFIG.logDir);

  const results = {
    date: calendar.todayISO(),
    steps: {},
    validation: {},
    ingestedData: {
      sec: {},
      macro: null,
      sentiment: null,
      news: null,
      press: null,
      whitehouse: null
    }
  };

  const actionRequired = [];
  let hasErrors = false;
  let hasWarnings = false;

  try {
    // ============ STEP 1: PRESS RELEASES ============
    logger.startStep(0);
    logger.log("PRESS", "Fetching press releases...");

    if (!CONFIG.skipIngestion) {
      await importScript("./press/index.js", logger, "PRESS");
      await importScript("./press/summary.js", logger, "PRESS");
    }

    // Validate press release parsing
    if (CONFIG.validatePress) {
      logger.log("PRESS", "Validating press release pages...");
      const pressResults = await pressChecker.checkAllTickers(CONFIG.useAI, (ticker, i, total) => {
        logger.updateStep(0, Math.round((i / total) * 100), ticker);
      });

      // Log validation results
      let pressOk = 0;
      for (const r of pressResults) {
        logger.logPressValidation(r.ticker, r.checks, r.latest);
        if (r.checks.url && r.checks.format && r.checks.text) pressOk++;
        else {
          hasWarnings = true;
          if (!r.checks.format) actionRequired.push(`${r.ticker}: Press page format changed`);
        }
      }

      results.validation.press = pressResults;
      logger.completeStep(0, pressResults.length, pressOk === pressResults.length ? "done" : "warning");
    } else {
      logger.completeStep(0, 0, "done");
    }

    // Load press JSON
    try {
      results.ingestedData.press = JSON.parse(
        fs.readFileSync(path.join(__dirname, "press/AA_press_summary.json"), "utf8")
      );
      logger.log("PRESS", `Loaded ${Object.keys(results.ingestedData.press).length} tickers`, "ok");
    } catch (err) {
      logger.log("PRESS", `Failed to load JSON: ${err.message}`, "warn");
    }

    // ============ STEP 2: WHITE HOUSE ============
    logger.startStep(1);
    logger.log("WH", "Fetching White House news...");

    if (!CONFIG.skipIngestion) {
      await importScript("./whitehouse/index.js", logger, "WH");
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

    results.validation.policy = policyResults;
    logger.completeStep(1, policyResults.length);

    // Load WH JSON
    try {
      results.ingestedData.whitehouse = JSON.parse(
        fs.readFileSync(path.join(__dirname, "whitehouse/whitehouse_summary.json"), "utf8")
      );
      logger.log("WH", `Loaded whitehouse data`, "ok");
    } catch (err) {
      logger.log("WH", `Failed to load JSON: ${err.message}`, "warn");
    }

    // ============ STEP 3: NEWS ============
    logger.startStep(2);
    logger.log("NEWS", "Processing news files...");

    if (!CONFIG.skipIngestion) {
      await importScript("./news/index.js", logger, "NEWS");
    }

    // Validate news
    if (CONFIG.validateNews) {
      const newsResults = await newsChecker.checkAllSources(CONFIG.useAI, (source, i, total) => {
        logger.updateStep(2, Math.round((i / total) * 100), source);
      });

      for (const r of newsResults) {
        logger.logNewsValidation(r.source, r.checks, r.articleCount, r.tickers);
        if (r.failedArticles?.length > 0) {
          hasWarnings = true;
          for (const f of r.failedArticles.slice(0, 2)) {
            logger.log("NEWS", `  Failed: ${f.file} - ${f.reason}`, "warn");
          }
        }
      }

      results.validation.news = newsResults;
      const summary = newsChecker.getSummary(newsResults);
      logger.completeStep(2, summary.totalArticles, summary.aiPassed === summary.totalArticles ? "done" : "warning");
    } else {
      logger.completeStep(2, 0, "done");
    }

    // Load news JSON
    try {
      results.ingestedData.news = JSON.parse(
        fs.readFileSync(path.join(__dirname, "news/news_summary.json"), "utf8")
      );
      const totalArticles = Object.values(results.ingestedData.news).flat().length;
      logger.log("NEWS", `Loaded ${totalArticles} articles`, "ok");
    } catch (err) {
      logger.log("NEWS", `Failed to load JSON: ${err.message}`, "warn");
    }

    // ============ STEP 4: SEC EDGAR ============
    logger.startStep(3);
    logger.log("SEC", "Fetching SEC filings...");

    if (!CONFIG.skipIngestion) {
      await importScript("./edgar/fetch.js", logger, "SEC");
    }

    // Run SEC validation checker
    logger.log("SEC", "Running SEC validation checker...");
    const secResults = await secChecker.checkAllTickers(2, (ticker, i, total) => {
      logger.updateStep(3, Math.round((i / total) * 100), ticker);
    });

    // Load ingested SEC data for comparison
    let ingestedSEC = {};
    try {
      const edgarDir = path.join(__dirname, "edgar/edgar_clustered_json");
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
        hasWarnings = true;
        actionRequired.push(`${row.ticker}: SEC mismatch (ingested: ${row.ingestor}, API: ${row.secCheck})`);
      }
    }

    results.validation.sec = { results: secResults, comparison };
    const secSummary = secChecker.getSummary(secResults);
    const secMatches = comparison.filter(r => r.match).length;
    logger.completeStep(3, secSummary.totalFilings, secMatches === comparison.length ? "done" : "warning");

    // ============ STEP 5: MACRO ============
    logger.startStep(4);
    logger.log("MACRO", "Fetching macro indicators...");

    if (!CONFIG.skipIngestion) {
      await importScript("./macro/index.js", logger, "MACRO");
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
        hasWarnings = true;
        const failed = Object.entries(row.checks).filter(([k, v]) => !v).map(([k]) => k);
        actionRequired.push(`${row.indicator}: Failed (${failed.join(", ")})`);
      }
    }

    results.validation.macro = macroResults;
    const macroOk = macroResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
    logger.completeStep(4, macroResults.length, macroOk === macroResults.length ? "done" : "warning");

    // Load macro JSON
    try {
      results.ingestedData.macro = JSON.parse(
        fs.readFileSync(path.join(__dirname, "macro/macro_summary.json"), "utf8")
      );
      logger.log("MACRO", `Loaded ${results.ingestedData.macro.Macro?.length || 0} indicators`, "ok");
    } catch (err) {
      logger.log("MACRO", `Failed to load JSON: ${err.message}`, "warn");
    }

    // ============ STEP 6: SENTIMENT ============
    logger.startStep(5);
    logger.log("SENTIMENT", "Fetching sentiment indicators...");

    if (!CONFIG.skipIngestion) {
      await importScript("./sentiment/index.js", logger, "SENTIMENT");
    }

    // Validate sentiment
    const sentimentResults = await sentimentChecker.checkAllIndicators((indicator, i, total) => {
      logger.updateStep(5, Math.round((i / total) * 100), indicator);
    });

    for (const r of sentimentResults) {
      logger.logMacroValidation(r.indicator, false, r.checks, r.value);
    }

    results.validation.sentiment = sentimentResults;
    const sentOk = sentimentResults.filter(r => r.checks.url && r.checks.format && r.checks.data).length;
    logger.completeStep(5, sentimentResults.length, sentOk === sentimentResults.length ? "done" : "warning");

    // Load sentiment JSON
    try {
      results.ingestedData.sentiment = JSON.parse(
        fs.readFileSync(path.join(__dirname, "sentiment/sentiment_summary.json"), "utf8")
      );
      logger.log("SENTIMENT", `Loaded sentiment data`, "ok");
    } catch (err) {
      logger.log("SENTIMENT", `Failed to load JSON: ${err.message}`, "warn");
    }

    // ============ STEP 7: UPLOAD DATA ============
    logger.startStep(6);
    logger.log("UPLOAD", "Uploading data to ingestor...");

    if (!CONFIG.skipIngestion) {
      const uploads = [
        { name: "macro", data: results.ingestedData.macro, endpoint: "/ingest/macro" },
        { name: "sentiment", data: results.ingestedData.sentiment, endpoint: "/ingest/sentiment" },
        { name: "news", data: results.ingestedData.news, endpoint: "/ingest/news" },
        { name: "press", data: results.ingestedData.press, endpoint: "/ingest/press" },
        { name: "whitehouse", data: results.ingestedData.whitehouse, endpoint: "/ingest/whitehouse" }
      ];

      let uploaded = 0;
      for (const u of uploads) {
        if (u.data) {
          try {
            const response = await fetch(`${INGEST_BASE}${u.endpoint}`, {
              method: "POST",
              body: JSON.stringify(u.data),
              headers: { "Content-Type": "application/json" }
            });

            if (response.ok) {
              logger.log("UPLOAD", `${u.name}: OK`, "ok");
              uploaded++;
            } else {
              logger.log("UPLOAD", `${u.name}: HTTP ${response.status}`, "warn");
              hasWarnings = true;
            }
          } catch (err) {
            logger.log("UPLOAD", `${u.name}: ${err.message}`, "fail");
            hasErrors = true;
          }
        }
        logger.updateStep(6, Math.round((uploaded / uploads.length) * 100));
      }

      logger.completeStep(6, uploaded);

      // EDGAR local ingestion
      logger.log("UPLOAD", "Running EDGAR local ingestion...");
      process.env.INGEST_URL = `${INGEST_BASE}/ingest/reports`;
      await importScript("./edgar/edgar_clustered_json/AA_ingestor.js", logger, "UPLOAD");
      logger.log("UPLOAD", "EDGAR ingestion complete", "ok");
    } else {
      logger.log("UPLOAD", "Skipped (validation only mode)", "info");
      logger.completeStep(6, 0);
    }

    // ============ STEP 8: FINAL VALIDATION SUMMARY ============
    logger.startStep(7);
    logger.updateStep(7, 100, "Complete");

    const summary = {
      hasErrors,
      hasWarnings,
      sections: {
        "SEC Edgar": {
          total: comparison.length,
          passed: secMatches,
          failed: comparison.length - secMatches,
          issues: comparison.filter(r => !r.match).map(r => r.ticker).join(", ")
        },
        "Macro": {
          total: macroResults.length,
          passed: macroOk,
          failed: macroResults.length - macroOk,
          issues: macroResults.filter(r => !r.checks.data).map(r => r.indicator).join(", ")
        },
        "Sentiment": {
          total: sentimentResults.length,
          passed: sentOk,
          failed: sentimentResults.length - sentOk
        },
        "Press Releases": {
          total: results.validation.press?.length || 0,
          passed: results.validation.press?.filter(r => r.checks.url && r.checks.format).length || 0,
          failed: results.validation.press?.filter(r => !r.checks.format).length || 0
        },
        "WH/FOMC": {
          total: policyResults.length,
          passed: policyResults.filter(r => r.checks.url && r.checks.format).length,
          failed: policyResults.filter(r => !r.checks.format).length
        },
        "News": {
          total: newsChecker.getSummary(results.validation.news || []).totalArticles,
          passed: newsChecker.getSummary(results.validation.news || []).aiPassed,
          failed: newsChecker.getSummary(results.validation.news || []).failed?.length || 0
        }
      },
      calendarEvents: calendar.getTodaysSummary().macro.map(e => ({
        name: e,
        confirmed: true
      })),
      actionRequired
    };

    results.summary = summary;
    logger.printFinalSummary(summary);
    logger.completeStep(7, 0);

    // Save results
    const logFile = logger.save();
    results.logFile = logFile;

    // Also save detailed results for dashboard
    const dashboardData = {
      date: results.date,
      validation: results.validation,
      summary: results.summary,
      calendar: calendar.getTodaysSummary()
    };

    fs.writeFileSync(
      path.join(CONFIG.logDir, `dashboard_${results.date}.json`),
      JSON.stringify(dashboardData, null, 2)
    );

    logger.log("DONE", `Dashboard data saved`, "ok");

  } catch (err) {
    console.error("Pipeline error:", err);
    hasErrors = true;
    results.error = err.message;
  } finally {
    logger.cleanup();
  }

  return results;
}

// Run
main().catch(console.error);
