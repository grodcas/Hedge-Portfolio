import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];

  // CVX content is inside .node__content (p + li)
  $(".node__content p").each((_, el) => {
    const t = $(el).text().trim();
    if (t) paragraphs.push(t);
  });

  $(".node__content li").each((_, el) => {
    const t = $(el).text().trim();
    if (t) paragraphs.push("• " + t);
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
