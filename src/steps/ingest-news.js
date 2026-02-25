// src/steps/ingest-news.js - News ingestion step

import fs from "fs";
import path from "path";
import * as newsChecker from "../../validation/lib/news_checker.js";
import { importScript } from "../lib/utils.js";
import { BASE_DIR } from "../lib/config.js";

/**
 * Ingest and validate news articles
 */
export async function ingestNews(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(2);
  logger.log("NEWS", "Processing news files...");

  if (!config.skipIngestion) {
    await importScript("../../news/index.js", logger, "NEWS");
  }

  // Validate news
  if (config.validateNews) {
    const newsResults = await newsChecker.checkAllSources(config.useAI, (source, i, total) => {
      logger.updateStep(2, Math.round((i / total) * 100), source);
    });

    for (const r of newsResults) {
      logger.logNewsValidation(r.source, r.checks, r.articleCount, r.tickers);
      if (r.failedArticles?.length > 0) {
        stepResult.hasWarnings = true;
        for (const f of r.failedArticles.slice(0, 2)) {
          logger.log("NEWS", `  Failed: ${f.file} - ${f.reason}`, "warn");
        }
      }
    }

    stepResult.validation = newsResults;
    const summary = newsChecker.getSummary(newsResults);
    logger.completeStep(2, summary.totalArticles, summary.aiPassed === summary.totalArticles ? "done" : "warning");
  } else {
    logger.completeStep(2, 0, "done");
  }

  // Load news JSON
  try {
    stepResult.data = JSON.parse(
      fs.readFileSync(path.join(BASE_DIR, "news/news_summary.json"), "utf8")
    );
    const totalArticles = Object.values(stepResult.data).flat().length;
    logger.log("NEWS", `Loaded ${totalArticles} articles`, "ok");
  } catch (err) {
    logger.log("NEWS", `Failed to load JSON: ${err.message}`, "warn");
  }

  return stepResult;
}

export default ingestNews;
