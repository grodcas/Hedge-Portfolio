import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeMSFT(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle0" });

  const html = await page.content();
  await browser.close();

  const $ = load(html);

  const results = [];

  // Microsoft lists each press item inside .fwpl-result
  $(".fwpl-result").each((_, el) => {
    const date = $(el).find(".kicker").text().trim();
    const title = $(el).find(".h2 a").text().trim();
    const href = $(el).find(".h2 a").attr("href");

    if (!date || !title || !href) return;

    results.push({
      date,
      title,
      url: href
    });
  });

  // return top 10 newest
  return results.slice(0, 10);
}

// Example use
scrapeMSFT("https://news.microsoft.com/source/tag/press-releases/")
  .then(console.log)
  .catch(console.error);
