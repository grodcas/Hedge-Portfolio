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
    timeout: 120000
  });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const paragraphs = [];

  // META PR paragraphs
  $("#_ctrl0_ctl51_divBody p").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}



scrapeArticle("https://investor.atmeta.com/investor-news/press-release-details/2025/Meta-Announces-Joint-Venture-with-Funds-Managed-by-Blue-Owl-Capital-to-Develop-Hyperion-Data-Center/default.aspx")
  .then(console.log)
  .catch(console.error);
