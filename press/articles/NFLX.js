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
  let stop = false;

  // Netflix uses <div class="module_body"> or <div class="module_item"> blocks
  const container = $(".module_body, .full-news-article, .articleBody, .xn-content");

  container.find("p, li, h2, h3, strong").each((_, el) => {
    if (stop) return;

    const t = $(el).text().trim();
    if (!t) return;

    // stop before “About Netflix”
    if (/about netflix/i.test(t)) {
      stop = true;
      return;
    }

    if (el.name === "li") {
      paragraphs.push(`- ${t}`);
    } else {
      paragraphs.push(t);
    }
  });

  return paragraphs.join("\n\n");
}

const url = process.argv[2];
scrapeArticle(url)
  .then(console.log)
  .catch(console.error);
