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

  $(".xn-content").children().each((_, el) => {
    const tag = el.tagName?.toLowerCase();

    if (tag === "p") {
      const txt = $(el).text().trim();

      // Stop when "About Lilly" appears
      if (txt.includes("About Lilly")) {
        stop = true;
        return false; // break
      }

      // Also stop after the “trademarks owned…” ending you mentioned
      if (txt.includes("trademarks owned or licensed")) {
        stop = true;
        return false;
      }

      if (!stop && txt) paragraphs.push(txt);
    }
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
