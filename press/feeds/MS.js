import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeMS(url) {
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

  // each release = <li class="row">
  $("li.row").each((_, el) => {
    const title = $(el).find("a.item-title").text().trim();
    const href = $(el).find("a.item-title").attr("href");
    const date = $(el).find(".pubdate").text().trim();

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
scrapeMS("https://www.morganstanley.com/about-us-newsroom#-536583991-tab")
  .then(console.log)
  .catch(console.error);
