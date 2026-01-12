import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeManual(url) {
  const browser = await puppeteer.launch({
    headless: false,           // you will see the window
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.setDefaultNavigationTimeout(0);  // no timeout
  await page.setDefaultTimeout(0);            // no timeout

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

  console.log(">>> NOW CLICK THE COOKIE POPUP MANUALLY <<<");
  console.log(">>> PRESS ENTER IN TERMINAL WHEN DONE <<<");

  // Wait for your ENTER
  await new Promise(resolve => {
    process.stdin.once("data", resolve);
  });

  // Continue scraping
  const html = await page.content();

  await browser.close();
  console.log(html)
  const $ = load(html);

  const items = [];
  // … your scraping logic here …

  return items;
}

// usage
scrapeManual("https://www.theguardian.com/business/stock-markets")
  .then(console.log)
  .catch(console.error);
