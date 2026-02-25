import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeAMZN(url) {
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

  $("li.SearchResultsModuleResults-items-item").each((_, el) => {
    const date = $(el).find(".PromoCardSearchResults-date").text().trim();
    const linkEl = $(el).find(".PromoCardSearchResults-title a");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    if (!date || !title || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10);
}

// usage
scrapeAMZN("https://press.aboutamazon.com/press-release-archive")
  .then(console.log)
  .catch(console.error);
