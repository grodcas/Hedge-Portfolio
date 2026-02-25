import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeJPM(url) {
  const browser = await puppeteer.launch({
        headless: false,
    args: ["--no-sandbox"]
    });

  const page = await browser.newPage();


    await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
        get: () => false,
    });
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });
  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const items = [];

  // Each item = <li><div class="list-container">...</div></li>
  $("ul.list-view li").each((_, el) => {
    const title = $(el).find("h2.cardText.title").text().trim();
    const date = $(el).find("p.cardText.date").text().trim();
    const href = $(el).find("a.link").attr("href");

    if (!title || !date || !href) return;

    items.push({
      date,
      title,
      url: href.startsWith("http") ? href : new URL(href, url).href
    });
  });

  return items.slice(0, 10);
}

// usage
scrapeJPM("https://www.jpmorganchase.com/newsroom/press-releases")
  .then(console.log)
  .catch(console.error);
