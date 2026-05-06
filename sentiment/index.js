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
// Defensive year-rollback. AAII publishes bars labeled "Mon DD" with no
// year (MHTML path) or "MM/DD/YYYY" (live HTML). Either source can yield
// a date that "looks like" the current year but is actually ahead of
// today (e.g. an MHTML snapshot from Dec 2025 read in May 2026 maps
// "Nov 19" → "2026-11-19" without this check). If the constructed date
// is in the future, roll back one year — that's always the right call
// for a sentiment-survey timestamp.
function rollbackIfFuture(iso) {
  if (!iso) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (iso <= today) return iso;
  const [y, m, d] = iso.split("-");
  return `${parseInt(y, 10) - 1}-${m}-${d}`;
}

function fixAAIIDate(str) {
  const [mon, day] = str.split(" ");
  const year = new Date().getFullYear();
  const monthNum = new Date(`${mon} 1, 2000`).getMonth() + 1;
  const iso = `${year}-${String(monthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return rollbackIfFuture(iso);
}

//-------------------------------------------------------------
// 1) AAII SENTIMENT SURVEY (LIVE SCRAPE, MHTML FALLBACK)
//-------------------------------------------------------------
function parseUSDate(s) {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  // Live AAII page occasionally renders a "next survey" date inside the
  // bars wrapper. Roll back if the parsed date is in the future — same
  // reasoning as fixAAIIDate.
  return rollbackIfFuture(`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`);
}

async function scrapeAAIILive() {
  const r = await axios.get("https://www.aaii.com/sentiment-survey", {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" }
  });
  const $ = cheerio.load(r.data);
  const rows = [];
  $(".bars").each((_, el) => {
    const wrapper = $(el).parent();
    const dateText = wrapper.text().match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1];
    if (!dateText) return;
    const bullish = parseFloat($(el).find(".bar.bullish").text().replace("%", ""));
    const neutral = parseFloat($(el).find(".bar.neutral").text().replace("%", ""));
    const bearish = parseFloat($(el).find(".bar.bearish").text().replace("%", ""));
    if (![bullish, neutral, bearish].every(Number.isFinite)) return;
    rows.push({ date: parseUSDate(dateText), bullish, neutral, bearish });
  });
  return rows.slice(0, 3);
}

function scrapeAAIIMhtml() {
  const file = path.join(__dirname, "AAII.mhtml");
  if (!fs.existsSync(file)) return [];
  // Staleness guard: MHTML is a manual snapshot. If older than 14 days, it's
  // stale enough that returning it would silently lie about sentiment.
  const ageDays = (Date.now() - fs.statSync(file).mtimeMs) / (1000 * 60 * 60 * 24);
  if (ageDays > 14) {
    console.error(`AAII MHTML fallback is ${Math.round(ageDays)} days stale; refusing to use.`);
    return [];
  }
  const raw = fs.readFileSync(file, "utf8");
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
  return rows.slice(0, 3);
}

async function scrapeAAII() {
  try {
    const live = await scrapeAAIILive();
    if (live.length > 0) return live;
    console.error("AAII live scrape returned 0 rows — falling back to MHTML.");
  } catch (e) {
    console.error("AAII live scrape failed:", e.message, "— falling back to MHTML.");
  }
  return scrapeAAIIMhtml();
}

//-------------------------------------------------------------
// 2) COT FUTURES (RAW NET POSITIONS)
//-------------------------------------------------------------
async function scrapeCOT() {
  const URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";

  function num(x) {
    return x === "." ? 0 : parseInt(x.replace(/,/g, ""), 10) || 0;
  }

  // CFTC's Cloudflare blocks Node's TLS fingerprint; curl is whitelisted.
  const { spawnSync } = await import("child_process");
  const r = spawnSync("curl", ["-fsSL", "--max-time", "20", URL], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) throw new Error(`COT curl failed: status=${r.status}`);
  const data = r.stdout;
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

await main();
console.log("→ SENTIMENT SUMMARY DONE");
