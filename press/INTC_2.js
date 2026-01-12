import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  // 🔥 CRITICAL: Intel loads text *after* the first HTML load
  await page.waitForSelector("div.entry-content p", { timeout: 60000 });

  const html = await page.content();
  await browser.close();

  const $ = load(html);

  const paragraphs = [];
  let stop = false;

  $("div.entry-content p").each((_, el) => {
    if (stop) return;
    const t = $(el).text().trim();
    if (!t) return;

    if (/about intel/i.test(t)) {
      stop = true;
      return;
    }
    paragraphs.push(t);
  });

  return paragraphs.join("\n\n");
}


scrapeArticle("https://newsroom.intel.com/corporate/intel-appoints-dr-craig-h-barratt-to-board-of-directors")
  .then(console.log)
  .catch(console.error);
