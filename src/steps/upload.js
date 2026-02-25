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
    const uploads = [
      { name: "macro", data: ingestedData.macro, endpoint: "/ingest/macro" },
      { name: "sentiment", data: ingestedData.sentiment, endpoint: "/ingest/sentiment" },
      { name: "news", data: ingestedData.news, endpoint: "/ingest/news" },
      { name: "press", data: ingestedData.press, endpoint: "/ingest/press" },
      { name: "whitehouse", data: ingestedData.whitehouse, endpoint: "/ingest/whitehouse" }
    ];

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
            stepResult.uploaded++;
          } else {
            logger.log("UPLOAD", `${u.name}: HTTP ${response.status}`, "warn");
            stepResult.hasWarnings = true;
          }
        } catch (err) {
          logger.log("UPLOAD", `${u.name}: ${err.message}`, "fail");
          stepResult.hasErrors = true;
        }
      }
      logger.updateStep(6, Math.round((stepResult.uploaded / uploads.length) * 100));
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
