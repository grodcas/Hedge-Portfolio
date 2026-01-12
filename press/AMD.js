import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeAMD(url) {
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

  // each release = <article class="media">
  $("article.media").each((_, el) => {
    const linkEl = $(el).find(".media-heading a");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    const date = $(el).find("time").attr("datetime")?.trim();

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
scrapeAMD("https://ir.amd.com/news-events/press-releases")
  .then(console.log)
  .catch(console.error);
