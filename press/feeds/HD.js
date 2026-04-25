import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { load } from "cheerio";

puppeteerExtra.use(StealthPlugin());

async function scrapeHD(url) {
  const browser = await puppeteerExtra.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Cloudflare interstitial: give it time to clear, then wait for the press table.
  await page.waitForSelector("tr .pr-date-field", { timeout: 20000 }).catch(() => {});
  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const items = [];

  $("tr").each((_, el) => {
    const date = $(el).find(".pr-date-field").text().trim();
    const linkEl = $(el).find(".pr-title-field a");
    const title = linkEl.text().trim();
    const href = linkEl.attr("href");

    if (!title || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10);
}

const year = new Date().getFullYear();
scrapeHD(`https://ir.homedepot.com/news-releases/${year}`)
  .then(console.log)
  .catch(console.error);
