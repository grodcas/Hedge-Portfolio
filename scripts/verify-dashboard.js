// scripts/verify-dashboard.js
//
// Spins up a headless Chromium, loads the new dashboard, captures console
// errors, asserts that the Portfolio tab widgets actually rendered real
// data from the backend APIs, and screenshots both the Portfolio tab and
// the Healthcare sector entity page.
//
// Run: `node scripts/verify-dashboard.js`  (dashboard server must already be on :4200).

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "logs", "dashboard-verify");
fs.mkdirSync(OUT_DIR, { recursive: true });

const URL = "http://localhost:4200/portfolio-funnel-mockup.html";

function log(...args) { console.log("[verify]", ...args); }

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => failedRequests.push(`${req.url()} → ${req.failure()?.errorText}`));

  log("navigating to", URL);
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 15000 });

  // bootstrapPortfolioTab runs async after DOMContentLoaded. Give it time.
  await new Promise((r) => setTimeout(r, 2500));

  // ---------- Assertions ----------
  const assertions = await page.evaluate(() => {
    const out = {};
    // 1. Sector table row count
    const sectorRows = document.querySelectorAll("#sectorTableBody tr");
    out.sectorRowCount = sectorRows.length;
    out.sectorNames = Array.from(sectorRows).map((tr) => tr.querySelector("td")?.textContent?.trim());

    // 2. Stock shortlist row count (excluding headers)
    const stockRows = document.querySelectorAll(".stock-row:not(.stock-row-head)");
    out.stockRowCount = stockRows.length;
    out.stockSample = stockRows[0] ? {
      ticker: stockRows[0].querySelector(".stock-ticker")?.textContent,
      // Child spans 2..10 are the 9 factor values
      cells: Array.from(stockRows[0].children).slice(1).map((el) => el.textContent.trim()),
    } : null;

    // 3. Stock row header presence (10 columns)
    const header = document.querySelector(".stock-row-head");
    out.stockHeaderCols = header ? Array.from(header.children).map((el) => el.textContent.trim()) : [];

    // 4. RRG point count
    const rrgCircles = document.querySelectorAll("#rrgSvg circle");
    out.rrgCircleCount = rrgCircles.length;
    // Detect empty-state text
    out.rrgEmptyState = Array.from(document.querySelectorAll("#rrgSvg text"))
      .some((t) => t.textContent.includes("data accumulating"));

    // 5. Scatter point count
    const scatterCircles = document.querySelectorAll("#scatterSvg circle");
    out.scatterCircleCount = scatterCircles.length;

    // 6. Scatter axis label should include "Rel P/E σ"
    const scatterLabels = Array.from(document.querySelectorAll("#scatterSvg text"))
      .map((t) => t.textContent);
    out.scatterHasRelPeLabel = scatterLabels.some((t) => t.includes("Rel P/E"));
    out.scatterHasEpsRevLabel = scatterLabels.some((t) => t.includes("EPS Rev"));

    // 7. Error banner presence
    const banner = document.getElementById("portfolio-error-banner");
    out.errorBanner = banner ? banner.textContent : null;

    return out;
  });

  log("Portfolio tab assertions:", JSON.stringify(assertions, null, 2));

  // Screenshot Portfolio tab
  const portfolioShot = path.join(OUT_DIR, "portfolio.png");
  await page.screenshot({ path: portfolioShot, fullPage: true });
  log("screenshot:", portfolioShot);

  // ---------- Click Healthcare sector entity ----------
  // First make sure the tile exists and is clickable.
  const healthcareClicked = await page.evaluate(() => {
    const el = document.querySelector('[data-open="sector:Healthcare"]');
    if (!el) return false;
    el.click();
    return true;
  });

  if (healthcareClicked) {
    await new Promise((r) => setTimeout(r, 2500));
    const entity = await page.evaluate(() => {
      const thesis = document.querySelector(".ep-thesis");
      return {
        entityViewVisible: !document.getElementById("entityView")?.classList.contains("hidden"),
        thesisHtml: thesis ? thesis.innerHTML.slice(0, 400) : null,
        hasLongTermMarker: !!thesis?.textContent?.includes("Long-term view"),
        hasTacticalMarker: !!thesis?.textContent?.includes("Tactical"),
      };
    });
    log("Healthcare entity:", JSON.stringify(entity, null, 2));
    const entityShot = path.join(OUT_DIR, "sector-healthcare.png");
    await page.screenshot({ path: entityShot, fullPage: true });
    log("screenshot:", entityShot);
  } else {
    log("Healthcare tile not clickable — entity rendering test skipped");
  }

  // ---------- Summary ----------
  log("\n=== CONSOLE MESSAGES ===");
  for (const m of consoleMessages) log(`  [${m.type}] ${m.text}`);
  log("\n=== PAGE ERRORS ===");
  for (const e of pageErrors) log(`  ${e}`);
  log("\n=== FAILED REQUESTS ===");
  for (const r of failedRequests) log(`  ${r}`);

  // Write structured output
  const summary = {
    url: URL,
    assertions,
    consoleMessages,
    pageErrors,
    failedRequests,
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  log("\nsummary:", path.join(OUT_DIR, "summary.json"));

  await browser.close();

  // Exit with nonzero if critical issues
  const critical = pageErrors.length > 0
    || assertions.sectorRowCount === 0
    || assertions.stockRowCount === 0;
  if (critical) {
    log("\n❌ critical issues detected");
    process.exit(1);
  }
  log("\n✅ dashboard rendered; inspect screenshots for visual verification");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
