import puppeteer from "puppeteer";
import { load } from "cheerio";

export {
  parseUSDateToISO,
  scrapeAllPutCall
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

  return result;
}


// usage
scrapeAllPutCall()
  .then(r => { console.log(r); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });