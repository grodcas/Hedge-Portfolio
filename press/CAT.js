import puppeteer from "puppeteer";
import { load } from "cheerio";
import fs from "fs";

async function scrapeCAT(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Click the cookie banner
  try {
    await page.waitForSelector("#onetrust-accept-btn-handler", { timeout: 5000 });
    await page.click("#onetrust-accept-btn-handler");
    await page.waitForTimeout(1500);
  } catch {}

  // Wait for the dynamic list to load
  await page.waitForSelector("ul.list__items li.list__item", { timeout: 15000 });

  const html = await page.content();

  // Debug (optional)
  fs.writeFileSync("cat_debug.html", html);

  const $ = load(html);
  const items = [];

  $("ul.list__items li.list__item").each((i, el) => {
    const title = $(el).find("h3.list__name").clone().children().remove().end().text().trim();
    const date = $(el).find("h3.list__name span").text().trim();
    const href = $(el).find("input#anchorValue").attr("value");

    if (!title || !date || !href) return;

    items.push({
      date,
      title,
      url: new URL(href, url).href
    });
  });

  await browser.close();
  return items;
}

// Run
scrapeCAT("https://www.caterpillar.com/en/news/corporate-press-releases.html")
  .then(console.log)
  .catch(console.error);
