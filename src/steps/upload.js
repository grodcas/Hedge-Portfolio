// src/steps/upload.js - Upload data to workers and trigger workflow

import { importScript } from "../lib/utils.js";
import { INGEST_BASE, WORKFLOW_BASE } from "../lib/config.js";

/**
 * Upload ingested data to Cloudflare workers
 */
export async function upload(config, logger, ingestedData) {
  const stepResult = {
    uploaded: 0,
    hasErrors: false,
    hasWarnings: false
  };

  logger.startStep(6);
  logger.log("UPLOAD", "Uploading data to ingestor...");

  if (!config.skipIngestion) {
    // News is handled server-side by news-funnel-orchestrator (Gemini-based RSS + Finnhub funnel)
    const uploads = [
      { name: "macro", data: ingestedData.macro, endpoint: "/ingest/macro" },
      { name: "sentiment", data: ingestedData.sentiment, endpoint: "/ingest/sentiment" },
      { name: "press", data: ingestedData.press, endpoint: "/ingest/press" },
      { name: "whitehouse", data: ingestedData.whitehouse, endpoint: "/ingest/whitehouse" }
    ];

    // Upload all endpoints in PARALLEL — independent ingestor POSTs
    const uploadResults = await Promise.all(
      uploads.map(async (u) => {
        if (!u.data) return { name: u.name, status: "skipped" };
        try {
          const response = await fetch(`${INGEST_BASE}${u.endpoint}`, {
            method: "POST",
            body: JSON.stringify(u.data),
            headers: { "Content-Type": "application/json" }
          });
          if (response.ok) {
            return { name: u.name, status: "ok" };
          }
          return { name: u.name, status: "warn", code: response.status };
        } catch (err) {
          return { name: u.name, status: "fail", error: err.message };
        }
      })
    );

    for (const r of uploadResults) {
      if (r.status === "ok") {
        logger.log("UPLOAD", `${r.name}: OK`, "ok");
        stepResult.uploaded++;
      } else if (r.status === "warn") {
        logger.log("UPLOAD", `${r.name}: HTTP ${r.code}`, "warn");
        stepResult.hasWarnings = true;
      } else if (r.status === "fail") {
        logger.log("UPLOAD", `${r.name}: ${r.error}`, "fail");
        stepResult.hasErrors = true;
      }
    }

    logger.completeStep(6, stepResult.uploaded);

    // EDGAR local ingestion
    logger.log("UPLOAD", "Running EDGAR local ingestion...");
    process.env.INGEST_URL = `${INGEST_BASE}/ingest/reports`;
    await importScript("../../edgar/edgar_clustered_json/AA_ingestor.js", logger, "UPLOAD");
    logger.log("UPLOAD", "EDGAR ingestion complete", "ok");

    // Trigger daily_update workflow for all tickers
    logger.log("UPLOAD", "Triggering daily_update workflow...");
    try {
      const workflowRes = await fetch(`${WORKFLOW_BASE}/run`, {
        method: "POST",
        body: JSON.stringify({ action: "daily_update" }),
        headers: { "Content-Type": "application/json" }
      });

      if (workflowRes.ok) {
        const result = await workflowRes.json();
        logger.log("UPLOAD", `Workflow started: ${result.workflowId}`, "ok");
        stepResult.workflowId = result.workflowId;
      } else {
        logger.log("UPLOAD", `Workflow trigger failed: HTTP ${workflowRes.status}`, "warn");
        stepResult.hasWarnings = true;
      }
    } catch (err) {
      logger.log("UPLOAD", `Workflow trigger error: ${err.message}`, "warn");
      stepResult.hasWarnings = true;
    }
  } else {
    logger.log("UPLOAD", "Skipped (validation only mode)", "info");
    logger.completeStep(6, 0);
  }

  return stepResult;
}

export default upload;
