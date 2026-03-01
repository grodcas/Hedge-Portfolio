import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];

  // GOOGL/Alphabet articles use various structures
  const containers = [
    "main",
    ".layout_content",
    ".article-content",
    ".ModuleBody",
    "article",
    ".wd_body"
  ];

  let container = null;
  for (const sel of containers) {
    const el = $(sel);
    if (el.length > 0 && el.text().trim().length > 50) {
      container = el;
      break;
    }
  }

  if (container) {
    container.find("p").each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && txt.length > 15) paragraphs.push(txt);
    });
  }

  // Fallback: get all paragraphs if nothing found
  if (paragraphs.length === 0) {
    $("p").each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && txt.length > 30) paragraphs.push(txt);
    });
  }

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
