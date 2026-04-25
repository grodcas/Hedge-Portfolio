import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { scrapeWhiteHouseArticle } from "./parser.js";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory (HF/.env)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------------------
// 1) White House news list parser
// -------------------------------
async function scrapeWhiteHouseNews() {
  const url = "https://www.whitehouse.gov/news/";
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const results = [];
  $("li.wp-block-post").each((_i, el) => {
    const a = $(el).find("h2.wp-block-post-title a");
    const title = a.text().trim();
    const link = a.attr("href");
    const datetime = $(el).find(".wp-block-post-date time").attr("datetime")?.trim() || null;
    const date = datetime ? datetime.split("T")[0] : null;
    if (title && link && date) results.push({ title, link, date });
  });
  console.log(`[WH] scraped ${results.length} posts from ${url}`);
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
    messages: [{ role: "user", content: prompt }],
  });
  return r.choices[0].message.content.trim();
}

// -------------------------------
// 3) MAIN PIPELINE
// -------------------------------
async function main() {
  const all = await scrapeWhiteHouseNews();

  // Rolling 3-day window. WH posts ~2-3/day, skips weekends, and timestamps
  // can cross UTC boundaries — a strict today-match silently drops most
  // runs. The ingestor's ON CONFLICT(id) DO UPDATE (id = hash(date|title))
  // makes re-scraping idempotent.
  const today = new Date().toISOString().split("T")[0];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 3);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const recent = all.filter(x => x.date >= cutoff);
  console.log(`[WH] window >= ${cutoff} (today=${today}): ${recent.length} articles`);

  if (recent.length === 0) {
    const availableDates = [...new Set(all.map(x => x.date))].sort();
    console.log(`[WH] no articles in window. available dates on page: ${availableDates.join(", ")}`);
  }

  const output = { WhiteHouse: [] };
  for (let i = 0; i < recent.length; i++) {
    const item = recent[i];
    try {
      const text = await scrapeWhiteHouseArticle(item.link);
      if (!text || text.length === 0) {
        console.warn(`[WH] empty article body: ${item.link}`);
        continue;
      }
      const summary = await summarize(text);
      output.WhiteHouse.push({ title: item.title, date: item.date, link: item.link, summary });
      console.log(`[WH] ${i + 1}/${recent.length} summarized · ${item.date} · ${item.title.slice(0, 60)}…`);
    } catch (err) {
      console.error(`[WH] failed on ${item.link}: ${err.message}`);
    }
  }

  const outputPath = path.join(__dirname, "whitehouse_summary.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[WH] wrote ${output.WhiteHouse.length} items to ${outputPath}`);
}

await main();
