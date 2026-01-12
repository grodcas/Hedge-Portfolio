import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapePG(url) {
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

  // Each blog/news item = <a class="blog-item ...">
  $("a.blog-item").each((_, el) => {
    const date = $(el).find(".blog-item__date").text().trim();
    const title = $(el).find(".blog-item__title h3").text().trim();
    const href = $(el).attr("href");

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
scrapePG("https://us.pg.com/newsroom/")
  .then(console.log)
  .catch(console.error);
