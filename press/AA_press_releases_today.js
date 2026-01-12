import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- LOADING BAR ----
function loadingBar(step, total) {
  const pct = Math.floor((step / total) * 100);
  const bars = Math.floor(pct / 5);
  process.stdout.write(`\r[${"█".repeat(bars)}${" ".repeat(20 - bars)}] ${pct}%`);
}

// ---- LOAD VALID DATES ARRAY ----
//const validDates = JSON.parse(
//  fs.readFileSync(path.join(__dirname, "latest_dates_array.json"), "utf8")
//);

const validDates = [new Date().toISOString().split("T")[0]];


// ---- NORMALIZER ----
function normalizeDate(raw) {
  if (!raw) return null;

  let s = String(raw).trim();
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\sat\s.+$/i, "").trim();
  s = s.replace(/\./g, "");

  // ISO first
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // FORCE UTC PARSING (fixes NVDA)
  const parsed = Date.parse(s + " UTC");
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  // Slash format
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`;
  }

  // “2 MAY 2025”
  const dmy = s.match(/^(\d{1,2}) ([A-Za-z]{3,}) (\d{4})$/);
  if (dmy) {
    const [_, d, mon, y] = dmy;
    const m = new Date(`${mon} 1, ${y}`).getMonth()+1;
    return `${y}-${String(m).padStart(2,"0")}-${d.padStart(2,"0")}`;
  }

  return null;
}



// ---- WARM PUPPETEER ----
async function warmPuppeteer() {
  const puppeteer = await import("puppeteer");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto("https://example.com", { timeout: 5000 }).catch(()=>{});

  await browser.close();
  console.log("Puppeteer warmed.\n");
}

// ---- TICKER FILES ----
const TICKERS = {
  AAPL: "AAPL.js",
  MSFT: "MSFT.js",
  GOOGL: "GOOGL.js",
  AMZN: "AMZN.js",
  NVDA: "NVDA.js",
  META: "META.js",
  BRKB: "BRK.js",
  JPM: "JPM.js",
  GS: "GS.js",
  BAC: "BAC.js",
  XOM: "XOM.js",
  CVX: "CVX.js",
  UNH: "UNH.js",
  LLY: "LLY.js",
  JNJ: "JNJ.js",
  PG: "PG.js",
  KO: "KO.js",
  HD: "HD.js",
  CAT: "CAT.js",
  BA: "BA.js",
  INTC: "INTC.js",
  AMD: "AMD.js",
  NFLX: "NFLX.js",
  MS: "MS.js"
};

// ---- RUN TICKER ----
function runTicker(fileName) {
  return new Promise(resolve => {
    const script = path.join(__dirname, fileName);
    const child = spawn("node", [script], { stdio: ["ignore","pipe","pipe"] });

    let out = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);   // skip this ticker
    }, 30000);         // 20 seconds max per ticker


    child.stdout.on("data", d => out += d);
    child.on("close", () => {
      clearTimeout(timer);
      try { resolve(eval("(" + out + ")")); }
      catch { resolve(null); }
    });
  });
}

// ---- MAIN ----
async function main() {
  const results = {};
  const errors = {};

  const entries = Object.entries(TICKERS);
  const total = entries.length;
  let count = 0;

  await warmPuppeteer();   // <-- this is the warm-up
  console.log("Processing tickers...\n");

  for (const [ticker, file] of entries) {
    count++;
    loadingBar(count, total);

    const items = await runTicker(file);
    if (!items) {
      errors[ticker] = "FAILED";
      continue;
    }


    const normalized = items.map(i => ({
      title: i.title,
      url: i.url,
      norm: normalizeDate(i.date)
    })).filter(i => i.norm);

    
    for (const x of normalized) {
      console.log(`${ticker} -> [${x.norm}] -> length ${x.norm.length}`);
    }

    //const todays = normalized.filter(i => validDates.includes(i.norm));
    const target = "2025-11-20";
    const todays = normalized.filter(i => i.norm === target);

    if (todays.length > 0) results[ticker] = todays;
  }

  fs.writeFileSync(
    "AA_press_releases_today.json",
    JSON.stringify({ results, errors }, null, 2)
  );

  console.log("\nSaved → press_releases_today.json");
}

main();
