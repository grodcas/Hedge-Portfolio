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

  $(".RichTextArticleBody p").each((_, el) => {
    if (stop) return;

    const txt = $(el).text().trim();
    if (!txt) return;

    // hard stop markers
    if (txt.includes("About Johnson") || txt.includes("About Johnson & Johnson")) {
      stop = true;
      return false;
    }

    // your exact supplied “end” snippet
    if (txt.includes("to read the full Prescribing Information")) {
      stop = true;
      return false;
    }

    paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
