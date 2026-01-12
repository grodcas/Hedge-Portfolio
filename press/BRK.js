import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeBRK(url) {
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

  // structure: <dl><dt><a>DATE</a></dt><dd>TITLE</dd></dl>
  $("dl").each((_, el) => {
    const link = $(el).find("dt a");
    const date = link.text().trim();
    const href = link.attr("href");
    const title = $(el).find("dd").text().trim();

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
scrapeBRK("https://www.berkshirehathaway.com/news/2025news.html")
  .then(console.log)
  .catch(console.error);
