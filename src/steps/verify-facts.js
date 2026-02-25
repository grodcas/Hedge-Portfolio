// src/steps/verify-facts.js - Fact verification step
// Runs AI fact-checking on summaries and prepares results for database storage

import fs from "fs";
import path from "path";
import { validateContent, getValidationTargets } from "../../validation/agents/index.js";
import { BASE_DIR, INGEST_BASE } from "../lib/config.js";

/**
 * Format fact verification result for database storage
 * Output: "claim : source_location : status"
 */
function formatFactForDB(fact, verification) {
  return {
    fact_claim: fact.claim,
    fact_type: fact.type || "qualitative",
    source_id: verification.source?.documentId || null,
    source_location: verification.source?.quote
      ? `chars:0-${verification.source.quote.length}`
      : null,
    source_quote: verification.source?.quote || null,
    status: verification.status,
    confidence: verification.confidence || 0
  };
}

/**
 * Run fact verification on a single summary
 * @param {Object} options
 * @param {string} options.summaryId - ID of the summary
 * @param {string} options.summaryTable - Table name (ALPHA_01_Reports, etc.)
 * @param {string} options.summaryText - The summary text to verify
 * @param {Array} options.sources - Array of {id, text} source documents
 * @param {boolean} options.useAI - Use AI verification (true) or quick rules (false)
 * @returns {Promise<Object>} - Verification results ready for DB
 */
export async function verifySummary(options) {
  const {
    summaryId,
    summaryTable,
    summaryText,
    sources = [],
    useAI = true
  } = options;

  const result = await validateContent({
    summary: summaryText,
    summaryId,
    summaryType: summaryTable,
    sources,
    useAI
  });

  // Format for database storage
  const dbRecords = [];

  if (result.extractedFacts?.facts && result.verification?.verificationResults) {
    const facts = result.extractedFacts.facts;
    const verifications = result.verification.verificationResults;

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const verification = verifications[i] || { status: "ERROR", confidence: 0 };

      dbRecords.push({
        summary_id: summaryId,
        summary_table: summaryTable,
        ...formatFactForDB(fact, verification)
      });
    }
  }

  return {
    summaryId,
    summaryTable,
    status: result.status,
    score: result.verification?.summaryScore?.verificationRate || 0,
    totalFacts: result.extractedFacts?.facts?.length || 0,
    verified: result.verification?.summaryScore?.verified || 0,
    notFound: result.verification?.summaryScore?.notFound || 0,
    contradicted: result.verification?.summaryScore?.contradicted || 0,
    records: dbRecords,
    issues: result.verification?.issues || []
  };
}

/**
 * Run fact verification on today's summaries
 * @param {Object} config - Pipeline configuration
 * @param {Object} logger - Pipeline logger instance
 * @returns {Promise<Object>} - Verification results
 */
export async function verifyFacts(config, logger) {
  const stepResult = {
    verified: 0,
    failed: 0,
    records: [],
    hasWarnings: false
  };

  logger.log("VERIFY", "Starting fact verification...");

  // Load today's summaries that need verification
  // For now, we'll verify press summaries as an example

  try {
    const pressPath = path.join(BASE_DIR, "press/AA_press_summary.json");
    if (fs.existsSync(pressPath)) {
      const pressSummaries = JSON.parse(fs.readFileSync(pressPath, "utf8"));

      for (const [ticker, articles] of Object.entries(pressSummaries)) {
        for (const article of articles) {
          if (!article.summary) continue;

          const result = await verifySummary({
            summaryId: `${ticker}-${article.date}-press`,
            summaryTable: "ALPHA_03_Press",
            summaryText: article.summary,
            sources: [{ id: "article", text: article.heading }],
            useAI: config.useAI
          });

          stepResult.records.push(...result.records);

          if (result.score >= 0.7) {
            stepResult.verified++;
          } else {
            stepResult.failed++;
            stepResult.hasWarnings = true;
          }

          logger.log("VERIFY", `${ticker}: ${result.totalFacts} facts, ${Math.round(result.score * 100)}% verified`);
        }
      }
    }
  } catch (err) {
    logger.log("VERIFY", `Error: ${err.message}`, "fail");
  }

  logger.log("VERIFY", `Complete: ${stepResult.verified} passed, ${stepResult.failed} warnings`);

  return stepResult;
}

/**
 * Upload fact verification records to database
 */
export async function uploadFactRecords(records) {
  if (!records || records.length === 0) return { success: true, count: 0 };

  try {
    const response = await fetch(`${INGEST_BASE}/ingest/facts`, {
      method: "POST",
      body: JSON.stringify({ facts: records }),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      return { success: true, count: records.length };
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate fact verification report for display
 */
export function generateFactReport(results) {
  const report = {
    totalSummaries: results.length,
    totalFacts: 0,
    verified: 0,
    partiallyVerified: 0,
    notFound: 0,
    contradicted: 0,
    issues: []
  };

  for (const result of results) {
    report.totalFacts += result.totalFacts || 0;
    report.verified += result.verified || 0;
    report.notFound += result.notFound || 0;
    report.contradicted += result.contradicted || 0;

    if (result.issues && result.issues.length > 0) {
      report.issues.push({
        summaryId: result.summaryId,
        issues: result.issues.map(i => ({
          claim: i.claim,
          status: i.status
        }))
      });
    }
  }

  report.verificationRate = report.totalFacts > 0
    ? Math.round((report.verified / report.totalFacts) * 100)
    : 100;

  return report;
}

export default verifyFacts;
