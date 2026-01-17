import fs from "fs";
import path from "path";
import process from "process";
import "dotenv/config";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

console.log("→ AA_EDGAR_SHORT_TERM STARTING");


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const END = new Date().toISOString().slice(0, 10);

const d = new Date();
d.setDate(d.getDate() - 1);
const START = d.toISOString().slice(0, 10);

//const END = "2025-10-1";
const START_DATE = new Date(START);
const TODAY = new Date(END);


const TICKERS = {
  AAPL:"0000320193",
  MSFT:"0000789019",GOOGL:"0001652044",
  AMZN:"0001018724",
  NVDA:"0001045810",META:"0001326801",TSLA:"0001318605",BRK:"0001067983",
  JPM:"0000019617",GS:"0000886982",BAC:"0000070858",XOM:"0000034088",
  CVX:"0000093410",UNH:"0000731766",LLY:"0000059470",JNJ:"0000200406",
  PG:"0000080424",KO:"0000021344",HD:"0000354950",CAT:"0000018230",
  BA:"0000012927",INTC:"0000050863",AMD:"0000002488",NFLX:"0001065280",
  MS:"0000895421"
};

const TARGET_FORMS = new Set(["10-K", "10-Q", "8-K", "4"]);
//const TARGET_FORMS = new Set(["10-K", "10-Q"]);

const OUT_DIR = path.join(process.cwd(), "edgar_raw_html");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// --------------------------------------------------

async function main() {

  for (const [ticker, cik] of Object.entries(TICKERS)) {

    console.log(`\n=== ${ticker} (${cik}) ===`);
    await sleep(1200);

    const data = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": "HedgeAI Research (contact: alifonsom2@gmail.com)" } }
    ).then(r => r.json());

    const f = data.filings.recent;

    for (let i = 0; i < f.form.length; i++) {
      const type = f.form[i];
      if (!TARGET_FORMS.has(type)) continue;

      const filingDate = new Date(f.filingDate[i]);
      if (filingDate < START_DATE || filingDate > TODAY) continue;

      const accession = f.accessionNumber[i];
      const primaryDoc = f.primaryDocument[i];

      const url = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${
        accession.replace(/-/g, "")
      }/${primaryDoc}`;

      const safeType = type.replace(/[^A-Za-z0-9-]/g, "");
      const safeDate = f.filingDate[i];
      const filename = `${ticker}_${safeType}_${safeDate}.html`;
      const outPath = path.join(OUT_DIR, filename);

      // skip if already downloaded
      if (fs.existsSync(outPath)) {
        console.log(`↺ Skipped (exists): ${filename}`);
        continue;
      }

      await sleep(800);

      const html = await fetch(url, {
        headers: { "User-Agent": "HedgeAI Research (contact: alifonsom2@gmail.com)" }
      }).then(r => r.text());

      fs.writeFileSync(outPath, html);
      console.log(`✓ Saved ${filename}`);
    }
  }

  console.log("\n✔ Done.");
}

//await main();



console.log("→ Parsing downloaded HTMLs");
execSync(`node edgar/edgar_dispatch.js ${START} ${END}`, { stdio: "inherit" });

console.log("→ Clustering parsed JSONs");
execSync(`node edgar/edgar_dispatch_cluster.js ${START} ${END}`, { stdio: "inherit" });

console.log("→ AA_EDGAR_SHORT_TERM DONE");
