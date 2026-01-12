import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeHD(url) {
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

  // each row = <tr>
  $("tr").each((_, el) => {
    const date = $(el).find(".pr-date-field").text().trim();
    const linkEl = $(el).find(".pr-title-field a");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

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
scrapeHD("https://ir.homedepot.com/news-releases/2025")
  .then(console.log)
  .catch(console.error);
