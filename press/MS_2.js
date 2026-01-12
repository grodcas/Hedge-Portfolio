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

  const container = $("article.press-release-article .body");

  container.find("p, li").each((_, el) => {
    if (stop) return;

    const t = $(el).text().trim();
    if (!t) return;

    // stop here
    if (/about morgan stanley real estate investing/i.test(t)) {
      stop = true;
      return;
    }

    if (el.name === "li") paragraphs.push(`- ${t}`);
    else paragraphs.push(t);
  });

  return paragraphs.join("\n\n");
}



// test
scrapeArticle("https://www.morganstanley.com/press-releases/msrei-and-gsa-accelerate-us-student-housing-expansion")
  .then(console.log)
  .catch(console.error);
