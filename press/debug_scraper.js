import puppeteer from "puppeteer";
import { load } from "cheerio";
import fs from "fs";

async function debugScrape(url, outputFile) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const html = await page.content();
  await browser.close();

  // Save raw HTML
  fs.writeFileSync(outputFile, html);
  console.log(`Saved HTML to ${outputFile}`);

  // Try to find article content with various selectors
  const $ = load(html);

  const selectors = [
    "article p",
    ".article-content p",
    ".press-release p",
    ".content p",
    "main p",
    "[class*='article'] p",
    "[class*='content'] p",
    "[class*='body'] p",
    ".richtext p",
    ".text p",
    "p"
  ];

  console.log("\n--- Selector Results ---");
  for (const sel of selectors) {
    const count = $(sel).length;
    if (count > 0) {
      const sample = $(sel).first().text().trim().substring(0, 80);
      console.log(`${sel}: ${count} matches - "${sample}..."`);
    }
  }

  // Show body classes
  console.log("\n--- Main containers ---");
  $("body > div, main, article, section").each((i, el) => {
    const classes = $(el).attr("class") || "";
    const id = $(el).attr("id") || "";
    if (classes || id) {
      console.log(`<${el.tagName}> class="${classes}" id="${id}"`);
    }
  });
}

const url = process.argv[2];
const output = process.argv[3] || "debug_output.html";
debugScrape(url, output).catch(console.error);
