import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeXOM(url) {
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

  // each item = div.contentCollection--item
  $("div.contentCollection--item").each((_, el) => {
    const linkEl = $(el).find("a.link-black");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    const date =
      $(el).find(".article--info__bottom .date").text().trim() ||
      $(el).find(".contentCollection--description").text().match(/\b[A-Z][a-z]+\.\s+\d{1,2},\s+\d{4}\b/)?.[0] ||
      "";

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
scrapeXOM("https://corporate.exxonmobil.com/news/news-releases")
  .then(console.log)
  .catch(console.error);
