//-------------------------------------------------------------
// sentiment_summary.js  (RAW DATA ONLY – NO AI)
//-------------------------------------------------------------
import "dotenv/config";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import qp from "quoted-printable";
import iconv from "iconv-lite";
import { load } from "cheerio";

console.log("→ SENTIMENT SUMMARY STARTING");

//-------------------------------------------------------------
// PATHS
//-------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//-------------------------------------------------------------
// HELPERS
//-------------------------------------------------------------
function today() {
  return new Date().toISOString().slice(0, 10);
}

function pctChange(curr, prev) {
  const c = Number(curr);
  const p = Number(prev);
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

function simplePair(name, latest, previous) {
  return {
    [`previous ${name}`]: previous,
    [`current ${name}`]: latest,
    [`pct_change ${name}`]: pctChange(latest, previous)
  };
}

//-------------------------------------------------------------
// AAII DATE FIX
//-------------------------------------------------------------
function fixAAIIDate(str) {
  const [mon, day] = str.split(" ");
  const year = new Date().getFullYear();
  const monthNum = new Date(`${mon} 1, 2000`).getMonth() + 1;
  return `${year}-${String(monthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

//-------------------------------------------------------------
// 1) AAII SENTIMENT SURVEY (RAW)
//-------------------------------------------------------------
async function scrapeAAII() {
  const raw = fs.readFileSync(
    "C:\\AI_agent\\HF\\sentiment\\AAII.mhtml",
    "utf8"
  );

  const htmlIdx = raw.indexOf("Content-Type: text/html");
  if (htmlIdx === -1) return [];

  const headerEndMatch = raw.slice(htmlIdx).match(/(\r?\n\r?\n)/);
  if (!headerEndMatch) return [];

  const qpBody = raw.slice(htmlIdx + headerEndMatch.index + headerEndMatch[0].length);
  const decodedHtml = iconv.decode(qp.decode(qpBody), "utf8");

  const $ = cheerio.load(decodedHtml);
  const rows = [];

  $("table.bordered tr").each((i, el) => {
    if (i === 0) return;
    const cols = $(el).find("td");
    if (cols.length !== 4) return;

    rows.push({
      date: fixAAIIDate($(cols[0]).text().trim()),
      bullish: parseFloat($(cols[1]).text().replace("%", "")),
      neutral: parseFloat($(cols[2]).text().replace("%", "")),
      bearish: parseFloat($(cols[3]).text().replace("%", ""))
    });
  });

  return rows.slice(0, 3); // latest 3 weeks
}

//-------------------------------------------------------------
// 2) COT FUTURES (RAW NET POSITIONS)
//-------------------------------------------------------------
async function scrapeCOT() {
  const URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";

  function num(x) {
    return x === "." ? 0 : parseInt(x.replace(/,/g, ""), 10) || 0;
  }

  const { data } = await axios.get(URL, { responseType: "text" });
  const lines = data.split("\n").map(x => x.trim()).filter(Boolean);

  let es = null;
  let nq = null;

  for (let line of lines) {
    const cols = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!cols) continue;

    const name = cols[0].replace(/"/g, "");

    const parseOne = () => ({
      asset_managers_net: num(cols[10]) - num(cols[11]),
      leveraged_funds_net: num(cols[13]) - num(cols[14])
    });

    if (name.includes("E-MINI S&P")) es = parseOne();
    if (name.includes("NASDAQ MINI")) nq = parseOne();
  }

  return { es, nq };
}

//-------------------------------------------------------------
// 3) CBOE PUT/CALL RATIOS (RAW)
//-------------------------------------------------------------
function parseUSDateToISO(str) {
  const m = str.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;

  const month = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  }[m[1]];

  return new Date(Date.UTC(+m[3], month, +m[2])).toISOString().slice(0, 10);
}

async function scrapeAllPutCall() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(
    "https://www.cboe.com/us/options/market_statistics/daily/",
    { waitUntil: "networkidle0" }
  );
//domcontentloaded
  await page.waitForSelector("#daily-market-statistics");
  const html = await page.content();
  const $ = load(html);

  const result = {};

  const dateRaw = $("button span").first().text().trim();
  result.date = parseUSDateToISO(dateRaw);

  $("td").each((_, el) => {
    const label = $(el).text().trim();
    if (!label.endsWith("PUT/CALL RATIO")) return;

    const val = parseFloat($(el).next("td").text().trim());
    if (!isFinite(val)) return;

    const key = label
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/\W+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    result[key] = val;
  });

  await browser.close();
  return result;
}

//-------------------------------------------------------------
// MAIN PIPELINE
//-------------------------------------------------------------
async function main() {
  const out = { Sentiment: [] };
  const d = today();

  // 1) Put/Call
  const putcall = await scrapeAllPutCall();
  if (Object.keys(putcall).length > 1) {
    out.Sentiment.push({
      heading: "Put/Call Ratios (CBOE)",
      date: today(),
      summary: putcall
    });
  }

  // 2) AAII
  const aaii = await scrapeAAII();
  if (aaii.length > 0) {
    out.Sentiment.push({
      heading: "AAII Sentiment Survey",
      date: aaii[0].date,
      summary: {
        latest: aaii[0],
        previous: aaii[1] || null,
        two_weeks_ago: aaii[2] || null
      }
    });
  }

  // 3) COT
  const cot = await scrapeCOT();
  if (cot.es || cot.nq) {
    out.Sentiment.push({
      heading: "COT Futures (ES / NQ)",
      date: d,
      summary: cot
    });
  }

  fs.writeFileSync(
    path.join(__dirname, "sentiment_summary.json"),
    JSON.stringify(out, null, 2)
  );
}

main().catch(err => {
  console.error("Sentiment pipeline error:", err);
  process.exit(1);
});

console.log("→ SENTIMENT SUMMARY DONE");
