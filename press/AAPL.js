import puppeteer from "puppeteer";
import { load } from "cheerio";

async function scrapeAAPL(url) {
    // 1) Launch headless Chrome
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
  const page = await browser.newPage();

  // 2) Use real browser UA so Apple gives real HTML
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  // 3) Load newsroom page fully
  await page.goto(url, { waitUntil: "networkidle0" });

  // 4) Get the actual rendered HTML
  const html = await page.content();
  await browser.close();

  const $ = load(html);

  // 5) Latest News = FIRST section-tiles inside #everydayfeed
  const latestSection = $("#everydayfeed .section-tiles").first();

  const items = [];

  latestSection.find("li.tile-item").each((_, li) => {
    const title = $(li).find(".tile__headline").text().trim();
    const ts = $(li).find(".tile__timestamp").attr("data-ts");
    const href = $(li).find("a.tile").attr("href");

    if (!title || !ts || !href) return;

    const date = ts.split("T")[0];
    const fullUrl = href.startsWith("http") ? href : new URL(href, url).href;

    items.push({ title, date, url: fullUrl });
  });

  if (!items.length) return [];

  return items.slice(0, 10);

}

// Example usage
scrapeAAPL("https://www.apple.com/uk/newsroom/")
  .then(console.log)
  .catch(console.error);
