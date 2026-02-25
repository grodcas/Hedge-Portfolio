import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeUNH(url) {
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

  // Each press release = <div class="wide-content-box">
  $("div.wide-content-box").each((_, el) => {
    const title = $(el).find(".wide-content-box__title").text().trim();
    const date = $(el).find(".wide-content-box__read-time-time span").text().trim();
    const href = $(el).find(".wide-content-box__cta a").attr("href");

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
scrapeUNH("https://www.unitedhealthgroup.com/newsroom/press-releases.html")
  .then(console.log)
  .catch(console.error);
