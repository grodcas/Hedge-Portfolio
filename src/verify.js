// src/verify.js - Standalone fact verification runner
// Run with: npm run verify

import "dotenv/config";
import fs from "fs";
import path from "path";
import { verifySummary, generateFactReport, uploadFactRecords } from "./steps/verify-facts.js";
import { BASE_DIR } from "./lib/config.js";

const VERIFY_CONFIG = {
  useAI: true,
  uploadToDb: false,  // Set to true to upload to D1
  targets: ["press"]  // What to verify: press, reports, trends, etc.
};

/**
 * Simple console logger
 */
const logger = {
  log: (step, msg, status = "info") => {
    const icon = status === "ok" ? "✓" : status === "fail" ? "✗" : status === "warn" ? "⚠" : "→";
    console.log(`[${step}] ${icon} ${msg}`);
  }
};

/**
 * Verify press release summaries
 */
async function verifyPressSummaries() {
  const results = [];
  const pressPath = path.join(BASE_DIR, "press/AA_press_summary.json");

  if (!fs.existsSync(pressPath)) {
    logger.log("PRESS", "No press summary file found", "warn");
    return results;
  }

  const pressSummaries = JSON.parse(fs.readFileSync(pressPath, "utf8"));
  const tickers = Object.keys(pressSummaries);

  logger.log("PRESS", `Verifying ${tickers.length} tickers...`);

  for (const ticker of tickers) {
    const articles = pressSummaries[ticker];
    if (!articles || articles.length === 0) continue;

    for (const article of articles) {
      if (!article.summary || article.summary.length < 50) continue;

      try {
        const result = await verifySummary({
          summaryId: `${ticker}-${article.date}-press`,
          summaryTable: "ALPHA_03_Press",
          summaryText: article.summary,
          sources: [{
            id: "headline",
            text: article.heading || ""
          }],
          useAI: VERIFY_CONFIG.useAI
        });

        results.push(result);

        const scoreStr = `${Math.round(result.score * 100)}%`;
        const status = result.score >= 0.7 ? "ok" : result.score >= 0.5 ? "warn" : "fail";
        logger.log("PRESS", `${ticker}: ${result.totalFacts} facts, ${scoreStr} verified`, status);

        // Log any issues
        if (result.issues && result.issues.length > 0) {
          for (const issue of result.issues.slice(0, 2)) {
            logger.log("PRESS", `  Issue: "${issue.claim?.substring(0, 50)}..." - ${issue.status}`, "warn");
          }
        }
      } catch (err) {
        logger.log("PRESS", `${ticker}: Error - ${err.message}`, "fail");
      }
    }
  }

  return results;
}

/**
 * Main verification runner
 */
async function main() {
  console.log("\n========================================");
  console.log("  FACT VERIFICATION - AI Summary Check");
  console.log("========================================\n");

  const allResults = [];
  const allRecords = [];

  // Verify press summaries
  if (VERIFY_CONFIG.targets.includes("press")) {
    const pressResults = await verifyPressSummaries();
    allResults.push(...pressResults);

    for (const r of pressResults) {
      allRecords.push(...r.records);
    }
  }

  // Generate report
  const report = generateFactReport(allResults);

  console.log("\n========================================");
  console.log("  VERIFICATION SUMMARY");
  console.log("========================================");
  console.log(`Total Summaries:    ${report.totalSummaries}`);
  console.log(`Total Facts:        ${report.totalFacts}`);
  console.log(`Verified:           ${report.verified}`);
  console.log(`Not Found:          ${report.notFound}`);
  console.log(`Contradicted:       ${report.contradicted}`);
  console.log(`Verification Rate:  ${report.verificationRate}%`);
  console.log("========================================\n");

  // Upload to database if enabled
  if (VERIFY_CONFIG.uploadToDb && allRecords.length > 0) {
    logger.log("DB", `Uploading ${allRecords.length} fact records...`);
    const uploadResult = await uploadFactRecords(allRecords);
    if (uploadResult.success) {
      logger.log("DB", `Uploaded ${uploadResult.count} records`, "ok");
    } else {
      logger.log("DB", `Upload failed: ${uploadResult.error}`, "fail");
    }
  }

  // Save report to file
  const reportPath = path.join(BASE_DIR, "logs", `verify_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    date: new Date().toISOString(),
    config: VERIFY_CONFIG,
    report,
    records: allRecords
  }, null, 2));

  logger.log("DONE", `Report saved to ${reportPath}`, "ok");
}

main().catch(console.error);
