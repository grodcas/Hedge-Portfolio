// src/steps/sync-dashboard.js - Poll workflow completion and sync dashboard data

import fs from "fs";
import path from "path";
import { INGEST_BASE, BASE_DIR } from "../lib/config.js";

const DATA_DIR = path.join(BASE_DIR, "data");

/**
 * Poll for workflow completion and sync dashboard data from D1
 */
export async function syncDashboard(config, logger, workflowId) {
  const stepResult = {
    synced: false,
    pollAttempts: 0,
    data: {}
  };

  logger.startStep(8);
  logger.log("SYNC", "Waiting for workflow completion...");

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Poll for workflow completion (max 5 minutes, check every 15 seconds)
  const maxAttempts = 20;
  const pollInterval = 15000;

  for (let i = 0; i < maxAttempts; i++) {
    stepResult.pollAttempts = i + 1;
    logger.updateStep(8, Math.round((i / maxAttempts) * 50));

    try {
      const statusRes = await fetch(`${INGEST_BASE}/query/workflow-status`);
      if (statusRes.ok) {
        const status = await statusRes.json();

        if (status.status === "done") {
          logger.log("SYNC", `Workflow completed at ${status.completed_at}`, "ok");
          break;
        }

        logger.log("SYNC", `Workflow status: ${status.status} (attempt ${i + 1}/${maxAttempts})`);
      }
    } catch (err) {
      logger.log("SYNC", `Status check failed: ${err.message}`, "warn");
    }

    // Wait before next poll
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Fetch and cache dashboard data
  logger.log("SYNC", "Fetching processed data from D1...");
  logger.updateStep(8, 60);

  const endpoints = [
    { name: "daily_macro", path: "/query/daily-macro", file: "daily_macro.json" },
    { name: "macro_trend", path: "/query/macro-trend", file: "macro_trend.json" },
    { name: "ticker_trends", path: "/query/ticker-trends", file: "ticker_trends.json" },
    { name: "daily_news", path: "/query/daily-news", file: "daily_news.json" },
    { name: "reports", path: "/query/reports", file: "reports.json" },
    { name: "earnings_calendar", path: "/query/earnings-calendar", file: "earnings_calendar.json" }
  ];

  let synced = 0;
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${INGEST_BASE}${ep.path}`);
      if (res.ok) {
        const data = await res.json();
        const filePath = path.join(DATA_DIR, ep.file);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        stepResult.data[ep.name] = true;
        synced++;
        logger.log("SYNC", `${ep.name}: cached`, "ok");
      } else {
        logger.log("SYNC", `${ep.name}: HTTP ${res.status}`, "warn");
      }
    } catch (err) {
      logger.log("SYNC", `${ep.name}: ${err.message}`, "fail");
    }
    logger.updateStep(8, 60 + Math.round((synced / endpoints.length) * 40));
  }

  stepResult.synced = synced > 0;
  logger.completeStep(8, synced);
  logger.log("SYNC", `Dashboard data synced (${synced}/${endpoints.length} endpoints)`, synced > 0 ? "ok" : "warn");

  return stepResult;
}

export default syncDashboard;
