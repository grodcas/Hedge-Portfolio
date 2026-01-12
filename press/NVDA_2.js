import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  // more relaxed wait + bigger timeout
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];

  $("div.entry-content p").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}


scrapeArticle("https://blogs.nvidia.com/blog/s3-compatible-ai-storage/")
  .then(console.log)
  .catch(console.error);
