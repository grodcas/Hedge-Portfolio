import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeLLY(url) {
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

  // each item = <li class="press-release-item press-release-feed-item">
  $("li.press-release-item.press-release-feed-item").each((_, el) => {
    const title = $(el).find(".press-release-feed-title").text().trim();
    const date = $(el).find(".press-release-feed-date").text().trim();
    const href = $(el).find(".press-release-feed-readmore").attr("href");

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
scrapeLLY("https://www.lilly.com/news/press-releases")
  .then(console.log)
  .catch(console.error);
