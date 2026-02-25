import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 25000
  });

  // Wait briefly for content to load
  await page.waitForSelector("article p", { timeout: 10000 }).catch(() => {});

  const html = await page.content();
  await browser.close();

  const $ = load(html);

  const paragraphs = [];

  $("article p, main p").each((_, el) => {
    const t = $(el).text().trim();
    if (!t || t.length < 20) return;

    // Stop at boilerplate
    if (/about intel/i.test(t)) return false;
    paragraphs.push(t);
  });

  return paragraphs.join("\n\n");
}


const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
