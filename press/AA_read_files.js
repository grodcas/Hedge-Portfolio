import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------
// SIMPLE LOADING BAR
// ----------------------
function loadingBar(step, total) {
  const pct = Math.floor((step / total) * 100);
  const bars = Math.floor(pct / 5);
  process.stdout.write(`\r[${"█".repeat(bars)}${" ".repeat(20 - bars)}] ${pct}%`);
}

// ----------------------
// READ RESULTS JSON
// ----------------------
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "press_releases_today.json"), "utf8")
).results;

// Count total articles
const tickers = Object.keys(data);
const totalArticles = tickers.reduce((acc, t) => acc + data[t].length, 0);

console.log(`Scraping ${totalArticles} articles...\n`);

let done = 0;

// ----------------------
// RUN TICKER_2.js
// ----------------------
function runArticleScraper(ticker, url) {
  return new Promise((resolve) => {
    const scraperFile = path.join(__dirname, `${ticker}_2.js`);

    const child = spawn("node", [scraperFile, url], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let out = "";
    child.stdout.on("data", d => out += d.toString());
    child.on("close", () => resolve(out.trim()));
  });
}

// ----------------------
// MAIN LOOP
// ----------------------
async function main() {
  for (const ticker of tickers) {
    const articles = data[ticker];

    for (const item of articles) {
      done++;
      loadingBar(done, totalArticles);

      const text = await runArticleScraper(ticker, item.url);

      console.log(`\n\n=== ${ticker} — ${item.title} ===\n`);
      console.log(text);
      console.log("\n----------------------------------------------\n");
    }
  }

  console.log("\nFinished scraping all articles.");
}

main();
