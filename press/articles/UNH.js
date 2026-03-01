import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];
  let stop = false;

  // Try multiple selectors for UNH articles
  const containers = [
    ".cmp-text-uhg.ojp-body-copy-component",
    ".cmp-text-uhg",
    ".newsroom-content",
    "article",
    ".content-body",
    "main"
  ];

  let container = null;
  for (const sel of containers) {
    const el = $(sel);
    if (el.length > 0) {
      container = el;
      break;
    }
  }

  if (container) {
    container.find("p").each((_, el) => {
      if (stop) return;
      const txt = $(el).text().trim();
      if (!txt || txt === " " || txt.length < 10) return;

      // Stop at boilerplate
      if (/about unitedhealth/i.test(txt)) {
        stop = true;
        return;
      }
      paragraphs.push(txt);
    });
  }

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
