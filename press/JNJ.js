import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeJNJ(url) {
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

  // Each press release block
  $("bsp-pagepromo.PagePromoSearch").each((_, el) => {

    const title = $(el).find("h2.PagePromo-title a").text().trim();
    const href = $(el).find("h2.PagePromo-title a").attr("href");
    const desc = $(el).find(".PagePromo-description").text().trim();
    const date = $(el).find(".PagePromo-date").text().trim();   // ✔ FIXED

    if (!title || !href) return;

    items.push({
      date,                                   // ← now captured
      title,
      summary: desc,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10);
}

// Usage
scrapeJNJ("https://www.jnj.com/media-center/press-releases")
  .then(console.log)
  .catch(console.error);
