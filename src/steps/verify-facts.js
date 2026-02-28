// src/steps/verify-facts.js - Hallucination verification step
// Uses simple hallucination checker to verify summaries against their source content
// IMPORTANT: Uses the SAME content that the summarization agent used

import fs from "fs";
import path from "path";
import { checkHallucination } from "../../validation/agents/hallucination-checker.js";
import { BASE_DIR, INGEST_BASE } from "../lib/config.js";

/**
 * Run hallucination check on today's summaries
 * Compares each summary against the SAME raw content used for summarization
 * @param {Object} config - Pipeline configuration
 * @param {Object} logger - Pipeline logger instance
 * @returns {Promise<Object>} - Verification results
 */
export async function verifyFacts(config, logger) {
  const stepResult = {
    passed: 0,
    failed: 0,
    errors: 0,
    totalChecked: 0,
    averageScore: 0,
    results: [], // Individual verification results for D1 upload
    hasWarnings: false
  };

  logger.log("VERIFY", "Starting hallucination check...");

  try {
    const pressPath = path.join(BASE_DIR, "press/AA_press_summary.json");
    if (!fs.existsSync(pressPath)) {
      logger.log("VERIFY", "No press summaries found", "warn");
      return stepResult;
    }

    const pressSummaries = JSON.parse(fs.readFileSync(pressPath, "utf8"));
    let totalScore = 0;

    for (const [ticker, articles] of Object.entries(pressSummaries)) {
      for (const article of articles) {
        if (!article.summary) continue;

        // Check if we have raw content (same content summarizer used)
        if (!article.rawContent) {
          logger.log("VERIFY", `${ticker}: No raw content available (run press summary first)`, "warn");
          stepResult.errors++;
          continue;
        }

        // Run hallucination check - comparing summary vs SAME source content
        const result = await checkHallucination(
          article.summary,
          article.rawContent,
          ticker
        );

        stepResult.totalChecked++;
        totalScore += result.score || 0;

        // Store result for D1 upload
        // New hallucination checker approach: score is 0-100 (accuracy percentage)
        stepResult.results.push({
          summaryId: ticker,
          summaryType: "press",
          totalFacts: 1, // Each summary is treated as 1 item to verify
          verified: result.status === "PASS" ? 1 : 0,
          notFound: 0,
          contradicted: result.status === "FAIL" ? 1 : 0,
          score: result.score, // Keep as 0-100 percentage
          issues: result.issues || [],
          analysis: result.analysis || ""
        });

        if (result.status === "PASS") {
          stepResult.passed++;
          logger.log("VERIFY", `${ticker}: PASS (score: ${result.score}%)`);
        } else if (result.status === "FAIL") {
          stepResult.failed++;
          stepResult.hasWarnings = true;
          const issueCount = result.issues?.length || 0;
          logger.log("VERIFY", `${ticker}: FAIL (score: ${result.score}%, ${issueCount} issues)`, "warn");
        } else {
          stepResult.errors++;
          logger.log("VERIFY", `${ticker}: ERROR - ${result.error}`, "fail");
        }
      }
    }

    stepResult.averageScore = stepResult.totalChecked > 0
      ? Math.round(totalScore / stepResult.totalChecked)
      : 0;

  } catch (err) {
    logger.log("VERIFY", `Error: ${err.message}`, "fail");
  }

  logger.log("VERIFY", `Complete: ${stepResult.passed} passed, ${stepResult.failed} failed, avg score: ${stepResult.averageScore}%`);

  return stepResult;
}

/**
 * Upload verification results to D1 database
 */
export async function uploadVerificationResults(results) {
  if (!results || results.length === 0) return { success: true, count: 0 };

  try {
    const response = await fetch(`${INGEST_BASE}/ingest/verification`, {
      method: "POST",
      body: JSON.stringify({ results }),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, count: data.inserted || results.length };
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate verification report for display
 */
export function generateFactReport(results) {
  const report = {
    totalSummaries: results.length || 0,
    totalFacts: 0,
    verified: 0,
    partiallyVerified: 0,
    notFound: 0,
    contradicted: 0,
    issues: [],
    verificationRate: 0
  };

  // Handle both old format and new stepResult format
  if (results.length === 1 && results[0].totalChecked !== undefined) {
    // New format from verifyFacts
    const r = results[0];
    report.totalSummaries = r.totalChecked || 0;
    report.verified = r.passed || 0;
    report.contradicted = r.failed || 0;
    report.verificationRate = r.averageScore || 0;
    return report;
  }

  // Old format
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
          problem: i.problem || i.status
        }))
      });
    }
  }

  report.verificationRate = report.totalSummaries > 0
    ? Math.round((report.verified / report.totalSummaries) * 100)
    : 100;

  return report;
}

export default verifyFacts;
