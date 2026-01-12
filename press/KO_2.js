import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

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

  const article = $("article.full-news-article");

  article.find("p").each((_, el) => {
    const txt = $(el).text().trim();
    if (!txt) return;

    // stop at About section
    if (txt.includes("About Coca-Cola Consolidated")) return false;

    paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}

scrapeArticle("https://investors.coca-colacompany.com/news-events/press-releases/detail/1145/coca-cola-consolidated-repurchases-all-outstanding-shares-held-by-the-coca-cola-company")
  .then(console.log)
  .catch(console.error);
