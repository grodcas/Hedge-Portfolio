// validation/agents/content_validator.js
// Orchestrates Fact Extractor + Source Verifier for content validation
// Validates that AI summaries don't invent data

import { extractFacts, quickExtractFacts } from "./fact_extractor.js";
import { verifyAllFacts, quickVerify, generateValidationReport } from "./source_verifier.js";

/**
 * Validate content by extracting facts and verifying against sources
 * @param {Object} options
 * @param {string} options.summary - The AI-generated summary to validate
 * @param {string} options.summaryId - Unique identifier
 * @param {string} options.summaryType - Type: report, cluster, trend, news, press, macro
 * @param {Array} options.sources - Array of {id, text} source documents
 * @param {boolean} options.useAI - Use AI validation (true) or quick rules (false)
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} - Complete validation result
 */
async function validateContent(options) {
  const {
    summary,
    summaryId,
    summaryType = "general",
    sources = [],
    useAI = true,
    onProgress = null
  } = options;

  const startTime = Date.now();

  // Step 1: Extract facts from summary
  if (onProgress) onProgress("extracting", 0, 2);

  let extractedFacts;
  if (useAI) {
    extractedFacts = await extractFacts(summary, summaryId, summaryType);
  } else {
    extractedFacts = {
      summaryId,
      summaryType,
      ...quickExtractFacts(summary)
    };
  }

  if (extractedFacts.error || extractedFacts.facts.length === 0) {
    return {
      summaryId,
      summaryType,
      status: extractedFacts.error ? "ERROR" : "NO_FACTS",
      extractedFacts,
      verification: null,
      report: null,
      duration: Date.now() - startTime,
      error: extractedFacts.error || "No facts extracted from summary"
    };
  }

  // Step 2: Verify facts against sources
  if (onProgress) onProgress("verifying", 1, 2);

  let verification;
  if (useAI && sources.length > 0) {
    verification = await verifyAllFacts(extractedFacts, sources, onProgress);
  } else if (sources.length > 0) {
    // Quick verification
    const combinedSource = sources.map(s => s.text).join("\n\n");
    const results = extractedFacts.facts.map(fact => ({
      factId: fact.id,
      claim: fact.claim,
      ...quickVerify(fact, combinedSource)
    }));

    verification = {
      summaryId,
      verificationResults: results,
      summaryScore: {
        totalFacts: results.length,
        verified: results.filter(r => r.status === "LIKELY_VERIFIED").length,
        notFound: results.filter(r => r.status === "LIKELY_NOT_FOUND").length,
        needsCheck: results.filter(r => r.status === "NEEDS_AI_CHECK").length,
        verificationRate: results.filter(r => r.status === "LIKELY_VERIFIED").length / results.length
      },
      issues: results.filter(r => r.status !== "LIKELY_VERIFIED")
    };
  } else {
    verification = {
      summaryId,
      verificationResults: [],
      summaryScore: { totalFacts: extractedFacts.facts.length, verificationRate: 0 },
      issues: [],
      note: "No source documents provided for verification"
    };
  }

  // Step 3: Generate report
  const report = generateValidationReport(verification);

  return {
    summaryId,
    summaryType,
    status: report.status,
    extractedFacts,
    verification,
    report,
    duration: Date.now() - startTime
  };
}

/**
 * Validate multiple content items in batch
 */
async function validateContentBatch(items, useAI = true, onProgress = null) {
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress(item.summaryId, i, items.length);

    const result = await validateContent({
      ...item,
      useAI,
      onProgress: null // Don't pass inner progress
    });

    results.push(result);
  }

  // Aggregate stats
  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === "PASS").length,
    warnings: results.filter(r => r.status === "WARNING").length,
    failed: results.filter(r => r.status === "FAIL").length,
    errors: results.filter(r => r.status === "ERROR" || r.status === "NO_FACTS").length
  };

  return { results, stats };
}

/**
 * Get validation targets - defines what summaries should be validated
 * and where their source data comes from
 */
function getValidationTargets() {
  return [
    {
      id: "report-summary",
      name: "Report Summaries (ALPHA_01)",
      description: "10-K/10-Q report summaries vs cluster data",
      summaryTable: "ALPHA_01_Reports",
      summaryField: "summary",
      sourceTable: "ALPHA_02_Clusters",
      sourceField: "summary",
      linkField: "ticker"
    },
    {
      id: "cluster-summary",
      name: "Cluster Summaries (ALPHA_02)",
      description: "Cluster summaries vs raw SEC HTML",
      summaryTable: "ALPHA_02_Clusters",
      summaryField: "summary",
      sourceTable: "RAW_SEC_HTML",
      sourceField: "content",
      linkField: "accession_number"
    },
    {
      id: "ticker-trend",
      name: "Ticker Trends (ALPHA_04)",
      description: "Trend summaries vs last 4 report summaries",
      summaryTable: "ALPHA_04_Trends",
      summaryField: "summary",
      sourceTable: "ALPHA_01_Reports",
      sourceField: "summary",
      linkField: "ticker",
      sourceLimit: 4
    },
    {
      id: "press-summary",
      name: "Press Release Summaries (ALPHA_03)",
      description: "Press release summaries vs raw HTML",
      summaryTable: "ALPHA_03_Press",
      summaryField: "summary",
      sourceTable: "RAW_PRESS_HTML",
      sourceField: "content",
      linkField: "ticker"
    },
    {
      id: "news-summary",
      name: "News Summaries (BETA_01)",
      description: "News article summaries vs raw news HTML",
      summaryTable: "BETA_01_News",
      summaryField: "summary",
      sourceTable: "RAW_NEWS_HTML",
      sourceField: "content",
      linkField: "article_id"
    },
    {
      id: "macro-trend",
      name: "Macro Trend (BETA_09)",
      description: "Weekly macro trend vs macro indicators",
      summaryTable: "BETA_09_Trend",
      summaryField: "summary",
      sourceTable: "BETA_03_Macro",
      sourceField: "value",
      linkField: "date"
    },
    {
      id: "daily-macro",
      name: "Daily Macro Summary (BETA_10)",
      description: "Daily macro summary vs macro indicators",
      summaryTable: "BETA_10_Daily_macro",
      summaryField: "summary",
      sourceTable: "BETA_03_Macro",
      sourceField: "value",
      linkField: "date"
    }
  ];
}

export {
  validateContent,
  validateContentBatch,
  getValidationTargets
};
