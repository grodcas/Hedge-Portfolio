//-------------------------------------------------------------
// sentiment_summary.js
//-------------------------------------------------------------
import "dotenv/config";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import qp from "quoted-printable";
import iconv from "iconv-lite";
import { load } from "cheerio";
//import { scrapeAllPutCall } from "./MarketPositioning.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


//-------------------------------------------------------------
// HELPERS
//-------------------------------------------------------------
function pct(a, b) {
  if (!a || !b) return null;
  const x = Number(a), y = Number(b);
  if (!isFinite(x) || !isFinite(y) || y === 0) return null;
  return ((x - y) / y) * 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

//-------------------------------------------------------------
// 1) CBOE PUT/CALL (multiple categories)
//-------------------------------------------------------------

function fixAAIIDate(str) {
  const [mon, day] = str.split(" ");
  const year = new Date().getFullYear();
  const monthNum = new Date(`${mon} 1, 2000`).getMonth() + 1;

  return `${year}-${String(monthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}



async function scrapeAAII() {
  const raw = fs.readFileSync("Sentiment Survey Past Results _ AAII.mhtml", "utf8");

  // 1) Find the HTML MIME part
  const htmlIdx = raw.indexOf("Content-Type: text/html");
  if (htmlIdx === -1) {
    console.error("HTML section not found");
    return [];
  }

  // 2) Find the end of MIME headers: match both \r\n\r\n and \n\n
  const headerEndMatch = raw.slice(htmlIdx).match(/(\r?\n\r?\n)/);
  if (!headerEndMatch) {
    console.error("HTML body not found");
    return [];
  }

  const headerEndOffset = htmlIdx + headerEndMatch.index + headerEndMatch[0].length;

  // 3) This is the quoted-printable encoded HTML body
  const qpBody = raw.slice(headerEndOffset);

  // 4) Decode it properly
  const decodedHtml = iconv.decode(qp.decode(qpBody), "utf8");

  // 5) Parse with cheerio
  const $ = cheerio.load(decodedHtml);
  const rows = [];

  $("table.bordered tr").each((i, el) => {
    if (i === 0) return; // skip header

    const cols = $(el).find("td");
    if (cols.length !== 4) return;

    rows.push({
      date: fixAAIIDate($(cols[0]).text().trim()),
      bullish: parseFloat($(cols[1]).text().replace("%", "")),
      neutral: parseFloat($(cols[2]).text().replace("%", "")),
      bearish: parseFloat($(cols[3]).text().replace("%", ""))
    });
  });
  console.log("Parse3")

  return rows.slice(0, 3);
}


//-------------------------------------------------------------
// 3) COT Futures (ES, NQ)
//-------------------------------------------------------------
async function scrapeCOT() {
  const URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";

  function num(x) {
    return x === "." ? 0 : parseInt(x.replace(/,/g, ""), 10) || 0;
  }

  const { data } = await axios.get(URL, {
    responseType: "text",
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const lines = data
    .split("\n")
    .map(x => x.trim())
    .filter(x => x.length > 0);

  let es = null;
  let nq = null;

  for (let line of lines) {
    const cols = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!cols) continue;

    const name = cols[0].replace(/"/g, "").trim();

    const parseOne = () => ({
      asset_managers: num(cols[10]) - num(cols[11]),
      leveraged_funds: num(cols[13]) - num(cols[14])
    });

    if (name.includes("E-MINI S&P")) es = parseOne();
    if (name.includes("NASDAQ MINI")) nq = parseOne();
  }
console.log("Parse1")

  return { es, nq };
}




 function parseUSDateToISO(str) {
  const m = str.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;

  const month = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  }[m[1]];

  const day = Number(m[2]);
  const year = Number(m[3]);

  // Force UTC → no timezone shift
  const d = new Date(Date.UTC(year, month, day));
  return d.toISOString().slice(0, 10);
}



async function scrapeAllPutCall() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
 
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  const url = "https://www.cboe.com/us/options/market_statistics/daily/";
  await page.goto(url, { waitUntil: "networkidle0" });

  // --- capture full rendered HTML ---
  await page.waitForSelector("#daily-market-statistics");
  const html = await page.content();

  // (optional: store HTML for debugging)
  // fs.writeFileSync("cboe_debug.html", html, "utf8");

  const $ = load(html);
  const result = {};

  // ------------------------------
  // 1) Extract the date
  // ------------------------------
const dateRaw = $("button.Button__StyledButton-cui__sc-1ahwe65-2 span.Button__TextContainer-cui__sc-1ahwe65-1")
  .first()
  .text()
  .trim();

const isoDate = dateRaw ? parseUSDateToISO(dateRaw) : null;
  // ------------------------------
  // 2) Extract the ratios
  // ------------------------------
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
  result.date = isoDate;
  console.log("Parse2")
  await browser.close();   // <-- ADD THIS

  return result;
}


//-------------------------------------------------------------
// OPENAI SUMMARIZER
//-------------------------------------------------------------
async function summarizeSentiment(heading, date, payload) {
  const prompt = `
Summarize the following sentiment indicators in one short, neutral, factual paragraph.

Rules:
- Mention only the most important values.
- Provide a qualitative judgement of sentiment direction (risk-on/off, fear/optimism).
- NO trading advice.
- Keep it concise.

Heading: ${heading}
Date: ${date}

Data:
${JSON.stringify(payload, null, 2)}
  `;

  const r = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return r.choices[0].message.content.trim();
}

//-------------------------------------------------------------
// MAIN PIPELINE
//-------------------------------------------------------------
async function main() {
  const out = { Sentiment: [] };
  const d = today();

  // 1) Put/Call
  const putcall = await scrapeAllPutCall();
  console.log("putcall");

  console.log(putcall);

  if (Object.keys(putcall).length > 0) {
    const summary = await summarizeSentiment(
      "Put/Call Ratios (CBOE)",
      putcall.date,
      putcall
    );
    out.Sentiment.push({
      heading: "Put/Call Ratios (CBOE)",
      date: putcall.date,
      summary
    });
  }

  // 2) AAII
  const aaii = await scrapeAAII();
  if (aaii.length > 0) {
    const summary = await summarizeSentiment("AAII Sentiment Survey", aaii[0].date, aaii);
    out.Sentiment.push({
      heading: "AAII Sentiment Survey",
      date: aaii[0].date,
      summary
    });
  }

  // 3) COT
  const cot = await scrapeCOT();
  if (cot.es || cot.nq) {
    const summary = await summarizeSentiment("COT Futures (ES/NQ)", d, cot);
    out.Sentiment.push({
      heading: "COT Futures (ES/NQ)",
      date: d,
      summary
    });
  }

  fs.writeFileSync(
    path.join(__dirname, "sentiment_summary.json"),
    JSON.stringify(out, null, 2)
  );
}

main().catch(err => {
  console.error("Error in sentiment_summary:", err);
  process.exit(1);
});
