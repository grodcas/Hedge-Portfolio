// src/steps/ingest-news.js - News ingestion step
// News is now handled server-side via GPT-5-mini web search in the news-orchestrator worker.
// This step is kept as a passthrough — the actual search happens when the workflow runs.

/**
 * News step — server-side AI search (no local HTML parsing)
 */
export async function ingestNews(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(2);
  logger.log("NEWS", "News is handled server-side (GPT-5-mini web search)");
  logger.log("NEWS", "The news-orchestrator worker will search all 25 tickers in parallel", "info");
  logger.log("NEWS", "Phase 1: Per-ticker web search → Phase 2: Curator selection & scoring", "info");
  logger.completeStep(2, 0, "done");

  return stepResult;
}

export default ingestNews;
