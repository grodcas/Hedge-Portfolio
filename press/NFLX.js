import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeNFLX(url) {
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

  // items are inside .module_item
  $(".module_item").each((_, el) => {
    const title = $(el).find(".module_headline a").text().trim();
    const href = $(el).find(".module_headline a").attr("href");

    const date = $(el)
      .find(".module_body time, .module_date, .module_date-text")
      .text()
      .trim();

    if (!title || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href,
    });
  });

  return items.slice(0, 10);
}

// usage
scrapeNFLX("https://ir.netflix.net/investor-news-and-events/financial-releases/default.aspx")
  .then(console.log)
  .catch(console.error);
