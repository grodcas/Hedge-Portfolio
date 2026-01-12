import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeGOOGL(url) {
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

  // Each news item = <div role="listitem" class="evergreen-item evergreen-news-item ...">
  $("#_ctrl0_ctl43_divNewsItemsContainer [role=listitem]").each((_, el) => {
    const date = $(el).find(".evergreen-news-date").text().trim();
    const linkEl = $(el).find(".evergreen-news-headline a");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    if (!date || !title || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10); // latest 10
}

// Usage
scrapeGOOGL("https://abc.xyz/investor/news/")
  .then(console.log)
  .catch(console.error);
