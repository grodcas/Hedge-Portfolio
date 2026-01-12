import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeINTC(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle0" });
  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const items = [];

  // Intel uses a wrapper: <div class="post-result-item-container">
  $("div.post-result-item-container").each((_, el) => {
    const linkEl = $(el).find("a.post-result-item");
    const href = linkEl.attr("href");

    const title = $(el).find("h2").first().text().trim();
    const date = $(el).find(".item-post-date").text().trim();

    if (!title || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10);
}

// usage
scrapeINTC("https://newsroom.intel.com/news")
  .then(console.log)
  .catch(console.error);
