import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeMSFTArticle(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle0" });
  const html = await page.content();
  await browser.close();

  const $ = load(html);

  const paragraphs = [];

  // Microsoft article text = all <p> inside .mssrc-block-content-block
  $(".mssrc-block-content-block p").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeMSFTArticle(url)
  .then(console.log)
  .catch(console.error);
