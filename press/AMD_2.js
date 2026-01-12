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

  // include paragraphs, headings AND list items
  $(".full-news-article p, .full-news-article h3, .full-news-article strong, .full-news-article li")
    .each((_, el) => {
      const tag = el.tagName?.toLowerCase?.() || el.name; // cheerio name
      const t = $(el).text().trim();
      if (!t) return;

      // stop before Supporting Resources section
      if (t.toLowerCase().includes("supporting resources")) {
        return false;
      }

      if (tag === "li") {
        paragraphs.push(`- ${t}`);
      } else {
        paragraphs.push(t);
      }
    });

  return paragraphs.join("\n\n");
}


// test
scrapeArticle(
  "https://ir.amd.com/news-events/press-releases/detail/1266/amd-unveils-strategy-to-lead-the-1-trillion-compute-market-and-accelerate-next-phase-of-growth"
)
  .then(console.log)
  .catch(console.error);
