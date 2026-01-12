import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeAAII(url) {
  const browser = await puppeteer.launch({
    headless: "true",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  // reduce blocking
  await page.setDefaultNavigationTimeout(60000);

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  // AAII hates "networkidle0", use "domcontentloaded"
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const html = await page.content();
  console.log(html)
  await browser.close();

  const $ = load(html);
  const rows = [];

  $("table.bordered tr").each((i, el) => {
    if (i === 0) return;

    const cols = $(el).find("td");
    if (cols.length !== 4) return;

    rows.push({
      date: $(cols[0]).text().trim(),
      bullish: parseFloat($(cols[1]).text().replace("%","")),
      neutral: parseFloat($(cols[2]).text().replace("%","")),
      bearish: parseFloat($(cols[3]).text().replace("%",""))
    });
  });

  return rows.slice(0, 4);
}

scrapeAAII("https://www.aaii.com/sentimentsurvey/sent_results")
  .then(console.log)
  .catch(console.error);
