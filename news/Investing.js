import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeInvesting(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

  const html = await page.content();
  await browser.close();

  const $ = load(html);
  const items = [];

  // each article
  $("article[data-test='article-item']").each((_, el) => {
    const title = $(el)
      .find("a[data-test='article-title-link']")
      .text()
      .trim();

    const link = $(el)
      .find("a[data-test='article-title-link']")
      .attr("href");

    const date = $(el)
      .find("time[data-test='article-publish-date']")
      .attr("datetime");

    if (!title || !link) return;

    items.push({
      title,
      url: link.startsWith("http") ? link : `https://www.investing.com${link}`,
      date
    });
  });

  return items.slice(0, 20);
}

// example
scrapeInvesting("https://www.investing.com/news/stock-market-news")
  .then(console.log)
  .catch(console.error);
