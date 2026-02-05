import fs from "fs";
import path from "path";
import process from "process";
import "dotenv/config";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const TICKERS = {
  AAPL:"0000320193" ,
  MSFT:"0000789019",GOOGL:"0001652044",
  AMZN:"0001018724",
  NVDA:"0001045810",META:"0001326801",TSLA:"0001318605",BRK:"0001067983",
  JPM:"0000019617",GS:"0000886982",BAC:"0000070858",XOM:"0000034088",
  CVX:"0000093410",UNH:"0000731766",LLY:"0000059470",JNJ:"0000200406",
  PG:"0000080424",KO:"0000021344",HD:"0000354950",CAT:"0000018230",
  BA:"0000012927",INTC:"0000050863",AMD:"0000002488",NFLX:"0001065280",
  MS:"0000895421"
};

async function main() {

  for (const [ticker, cik] of Object.entries(TICKERS)) {

    console.log(`\n=== ${ticker} (${cik}) ===`);
    await sleep(1500);

    const data = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": "HedgeAI Research (contact: alifonsom2@gmail.com)" } }
    ).then(r => r.json());

    const f = data.filings.recent;

    const filings = f.form.map((type, i) => ({
      type,
      date: f.filingDate[i],
      period: f.reportDate[i],
      accession: f.accessionNumber[i],
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${
        f.accessionNumber[i].replace(/-/g, "")
      }/${f.primaryDocument[i]}`
    }));

    const tenK = filings.filter(x => x.type === "10-K").slice(0, 3);
    const tenQ = filings.filter(x => x.type === "10-Q").slice(0, 4);
    const relevant = filings.filter(x => ["8-K","4","5"].includes(x.type)).slice(0, 10);
    const longTerm = [...tenK, ...tenQ, ...relevant];

    for (const file of longTerm) {

      await sleep(800);

      const rawHtml = await fetch(file.url, {
        headers: { "User-Agent": "HedgeAI Research (contact: alifonsom2@gmail.com)" }
      }).then(r => r.text());

      // --------------------------
      // WRITE RAW HTML TO FILE
      // --------------------------
      const safeType = file.type.replace(/[^A-Za-z0-9-]/g, "");
      const safeDate = file.date.replace(/[^0-9-]/g, "");

      const outDir = "C:/AI_agent/HF/edgar/edgar_raw_html";
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

      const filename = path.join(
        outDir,
        `${ticker}_${safeType}_${safeDate}.html`
      );

      fs.writeFileSync(filename, rawHtml);

      console.log(`✓ Saved ${filename}`);
    }
  }

  console.log("\n✔ Done.");
}

main();
