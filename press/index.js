import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("PRESS RELEASES FETCH STARTED")

// ---- LOADING BAR ----
function loadingBar(step, total) {
  const pct = Math.floor((step / total) * 100);
  const bars = Math.floor(pct / 5);
  process.stdout.write(`\r[${"█".repeat(bars)}${" ".repeat(20 - bars)}] ${pct}%`);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}


// ---- DATE NORMALIZER ----
function normalizeDate(raw) {
  if (!raw) return null;

  let s = String(raw).trim();
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\sat\s.+$/i, "").trim();
  s = s.replace(/\./g, "");

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  const parsed = Date.parse(s + " UTC");
  if (!isNaN(parsed))
    return new Date(parsed).toISOString().slice(0, 10);

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash)
    return `${slash[3]}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`;

  const dmy = s.match(/^(\d{1,2}) ([A-Za-z]{3,}) (\d{4})$/);
  if (dmy) {
    const [_, d, mon, y] = dmy;
    const m = new Date(`${mon} 1, ${y}`).getMonth() + 1;
    return `${y}-${String(m).padStart(2,"0")}-${d.padStart(2,"0")}`;
  }

  return null;
}

// ---- WARM PUPPETEER ----
async function warmPuppeteer() {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto("https://example.com", { timeout: 5000 }).catch(() => {});
  await browser.close();
  console.log("Puppeteer warmed.\n");
}

// ---- TICKERS ----
const TICKERS = {
  AAPL: "feeds/AAPL.js", MSFT: "feeds/MSFT.js", GOOGL: "feeds/GOOGL.js", AMZN: "feeds/AMZN.js",
  NVDA: "feeds/NVDA.js", META: "feeds/META.js", BRKB: "feeds/BRK.js", JPM: "feeds/JPM.js",
  GS: "feeds/GS.js", BAC: "feeds/BAC.js", XOM: "feeds/XOM.js", CVX: "feeds/CVX.js",
  UNH: "feeds/UNH.js", LLY: "feeds/LLY.js", JNJ: "feeds/JNJ.js", PG: "feeds/PG.js",
  KO: "feeds/KO.js", HD: "feeds/HD.js", CAT: "feeds/CAT.js", BA: "feeds/BA.js",
  INTC: "feeds/INTC.js", AMD: "feeds/AMD.js", NFLX: "feeds/NFLX.js", MS: "feeds/MS.js"
};

// ---- RUN TICKER (DISCOVERY) ----
function runTicker(fileName) {
  return new Promise(resolve => {
    const script = path.join(__dirname, fileName);
    const child = spawn("node", [script], { stdio: ["ignore","pipe","pipe"] });

    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ items: null, error: "TIMEOUT" });
    }, 30000);

    child.stdout.on("data", d => out += d);
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve({ items: eval("(" + out + ")"), error: null });
      } catch {
        resolve({ items: null, error: "INVALID_OUTPUT" });
      }
    });
  });
}

// ---- RUN ARTICLE SCRAPER (CONTENT) ----
function runArticleScraper(ticker, url) {
  return new Promise(resolve => {
    const file = path.join(__dirname, "articles", `${ticker}.js`);
    const child = spawn("node", [file, url], { stdio: ["ignore","pipe","pipe"] });

    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 30000);

    child.stdout.on("data", d => out += d.toString());
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.trim());
    });
  });
}

// ---- ARTICLE TEXT VALIDATION ----
function isValidArticleText(text) {
  if (!text) return false;
  if (text.length < 800) return false;
  if (text.includes("undefined")) return false;
  if (text.includes("Error")) return false;
  if (text.split("\n").length < 3) return false;
  return true;
}

// ---- MAIN ----
async function main() {
  const results = {};
  const errors = {};
  const healthCheck = {};  // Track parser validation for each ticker

  const entries = Object.entries(TICKERS);
  let count = 0;

  await warmPuppeteer();
  console.log("Processing tickers...\n");

  for (const [ticker, file] of entries) {
    count++;
    loadingBar(count, entries.length);

    const { items, error } = await runTicker(file);

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error(`❌ ${ticker} discovery failed → ${error}`);
      errors[ticker] = error || "EMPTY";
      healthCheck[ticker] = {
        discovery: false,
        content: false,
        error: error || "EMPTY",
        latest: null
      };
      continue;
    }

    const today = todayISO();
    const yesterday = yesterdayISO();

    // ----------------------------
    // (1) INGESTION: today/yesterday only (metadata-based)
    // ----------------------------
    const todays = items
      .map(i => ({
        title: i.title,
        url: i.url,
        norm: normalizeDate(i.date),
      }))
      .filter(i => i.url && i.norm && (i.norm === today || i.norm === yesterday));

    if (todays.length > 0) {
      results[ticker] = todays; // can be multiple if multiple PRs today/yesterday
    }

    // ----------------------------
    // (2) HEALTH CHECK: latest only (content-based)
    // ----------------------------
    const latest = items[0];
    const latestNorm = normalizeDate(latest.date);

    if (!latest?.url || !latestNorm) {
      console.error(`⚠️ ${ticker} latest invalid metadata`);
      console.error(`   ${latest?.title || "[NO TITLE]"}`);
      console.error(`   ${latest?.url || "[NO URL]"}`);
      healthCheck[ticker] = {
        discovery: true,
        content: false,
        error: "INVALID_METADATA",
        latest: { title: latest?.title, url: latest?.url, date: latestNorm }
      };
    } else {
      const text = await runArticleScraper(ticker, latest.url);
      const contentValid = isValidArticleText(text);
      if (!contentValid) {
        console.error(`❌ ${ticker} BAD LATEST ARTICLE`);
        console.error(`   ${latest.title}`);
        console.error(`   ${latest.url}`);
      }
      healthCheck[ticker] = {
        discovery: true,
        content: contentValid,
        error: contentValid ? null : "BAD_CONTENT",
        latest: { title: latest.title, url: latest.url, date: latestNorm },
        textLength: text ? text.length : 0
      };
    }

  }

  fs.writeFileSync(
    path.join(__dirname, "AA_press_releases_today.json"),
    JSON.stringify({ date: todayISO(), results, errors, healthCheck }, null, 2)
  );

  console.log("\nSaved → AA_press_releases_today.json");
}

await main();
console.log("PRESS RELEASES FETCH DONE")
