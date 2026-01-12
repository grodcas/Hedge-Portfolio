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

  $(".gs-uitk-c-1kdujvh--text-root--top-spacing-style-top-spacing--bottom-spacing-style-bottom-spacing--spacing-style-bottom-spacing p")
    .each((_, el) => {
      const txt = $(el).text().trim();
      if (txt) paragraphs.push(txt);
    });

  return paragraphs.join("\n\n");
}


scrapeArticle("https://www.goldmansachs.com/pressroom/press-releases/2025/denis-coleman-to-speak-at-goldman-sachs-us-financial-services-conference")
  .then(console.log)
  .catch(console.error);
