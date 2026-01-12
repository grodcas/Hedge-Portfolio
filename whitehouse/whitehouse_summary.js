import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import "dotenv/config";
import OpenAI from "openai";
import { scrapeWhiteHouseArticle } from "./WHparser2.js";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------------------
// 1) White House news list parser
// -------------------------------
async function scrapeWhiteHouseNews() {
  const url = "https://www.whitehouse.gov/news/";
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const results = [];

  $("li.wp-block-post").each((i, el) => {
    const a = $(el).find("h2.wp-block-post-title a");
    const title = a.text().trim();
    const link = a.attr("href");

    const timeEl = $(el).find(".wp-block-post-date time");
    const datetime = timeEl.attr("datetime")?.trim() || null;

    let date = null;
    if (datetime) date = datetime.split("T")[0];

    if (title && link && date) {
      results.push({ title, link, date });
    }
  });

  return results;
}

// -------------------------------
// 2) OpenAI summarizer
// -------------------------------
async function summarize(text) {
  const prompt = `
Summarize this White House press release in plain, neutral, factual English.
No opinions. No speculation. Only key facts.

TEXT:
${text}
  `;

  const r = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return r.choices[0].message.content.trim();
}

// -------------------------------
// 3) MAIN PIPELINE
// -------------------------------
async function main() {
  const all = await scrapeWhiteHouseNews();

  //const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const today = "2025-11-25";

  const todays = all.filter(x => x.date === today);

  const output = { WhiteHouse: [] };

  for (const item of todays) {
    const text = await scrapeWhiteHouseArticle(item.link);
    const summary = await summarize(text);

    output.WhiteHouse.push({
      title: item.title,
      date: item.date,
      summary
    });
  }

  fs.writeFileSync(
    path.join(__dirname, "whitehouse_summary.json"),
    JSON.stringify(output, null, 2)
  );
}

main();
