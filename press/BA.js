import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeBA(url) {
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

  // each press item = <div class="module_item">
  $("div.module_item").each((_, el) => {
    const title = $(el).find(".module_headline-link").text().trim();
    const href = $(el).find(".module_headline-link").attr("href");
    const date = $(el).find(".module_date-text").text().trim();

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
scrapeBA("https://investors.boeing.com/investors/overview/default.aspx")
  .then(console.log)
  .catch(console.error);
