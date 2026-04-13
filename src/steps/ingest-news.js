// src/steps/ingest-news.js - News ingestion step (passthrough)
// News is handled server-side by news-funnel-orchestrator, which runs as
// fire-and-forget inside the Cloudflare daily_update workflow. Stages:
//   1. news-funnel-gatherer: RSS + Finnhub raw headlines
//   2. news-funnel-filter: 33 parallel gpt-5-mini focused-filter calls
//   3. Gemini 2.5-flash summaries → BETA_12_News_digest
// This Node step is a no-op that only logs the handoff.

/**
 * News step — server-side news funnel (no local work)
 */
export async function ingestNews(config, logger, results) {
  const stepResult = {
    validation: null,
    data: null,
    actionRequired: [],
    hasWarnings: false
  };

  logger.startStep(2);
  logger.log("NEWS", "News is handled server-side by news-funnel-orchestrator");
  logger.log("NEWS", "RSS + Finnhub → gpt-5-mini filter → Gemini summaries → BETA_12", "info");
  logger.completeStep(2, 0, "done");

  return stepResult;
}

export default ingestNews;
