import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeArticle(url) {
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

  $(".RichTextArticleBody-body p").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) paragraphs.push(txt);
  });

  return paragraphs.join("\n\n");
}

scrapeArticle("https://press.aboutamazon.com/aws/2025/11/genspark-joins-forces-with-aws-to-deliver-the-next-generation-agentic-ai-experiences-for-users-worldwide")
  .then(console.log)
  .catch(console.error);