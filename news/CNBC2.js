import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeCNBCWorldMarkets(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const items = [];

  $(".Card-titleAndFooter").each((_, el) => {
    const linkEl = $(el).find(".Card-title");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    const date = $(el).find(".Card-time").text().trim() || null;

    if (!title || !href) return;

    items.push({
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href,
      date
    });
  });

  return items;
}

// usage
scrapeCNBCWorldMarkets("https://www.cnbc.com/market-insider/")
  .then(console.log)
  .catch(console.error);
