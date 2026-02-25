import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { scrapeWhiteHouseArticle } from "./WHparser2.js";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory (HF/.env)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

console.log("WH_SUMMARY STARTED")

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------------------
// 1) White House news list parser
// -------------------------------
async function scrapeWhiteHouseNews() {
  const url = "https://www.whitehouse.gov/news/";
  console.log("[DEBUG] Fetching news list from:", url);

  const html = await fetch(url).then(r => r.text());
  console.log("[DEBUG] HTML length received:", html.length);

  const $ = cheerio.load(html);

  const results = [];
  const postElements = $("li.wp-block-post");
  console.log("[DEBUG] Found post elements:", postElements.length);

  $("li.wp-block-post").each((i, el) => {
    const a = $(el).find("h2.wp-block-post-title a");
    const title = a.text().trim();
    const link = a.attr("href");

    const timeEl = $(el).find(".wp-block-post-date time");
    const datetime = timeEl.attr("datetime")?.trim() || null;

    let date = null;
    if (datetime) date = datetime.split("T")[0];

    console.log(`[DEBUG] Post ${i}: title="${title?.slice(0,50)}...", link=${!!link}, datetime="${datetime}", date="${date}"`);

    if (title && link && date) {
      results.push({ title, link, date });
    } else {
      console.log(`[DEBUG] Post ${i} SKIPPED - missing: title=${!title}, link=${!link}, date=${!date}`);
    }
  });

  console.log("[DEBUG] Total valid results:", results.length);
  return results;
}

// -------------------------------
// 2) OpenAI summarizer
// -------------------------------
async function summarize(text) {
  console.log("[DEBUG] summarize() called with text length:", text?.length || 0);

  const prompt = `
Summarize this White House press release in plain, neutral, factual English.
No opinions. No speculation. Only key facts.

TEXT:
${text}
  `;

  console.log("[DEBUG] Prompt length:", prompt.length);
  console.log("[DEBUG] Sending request to OpenAI (model: gpt-4.1-mini)...");

  try {
    const r = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }]
    });

    console.log("[DEBUG] OpenAI response received");
    console.log("[DEBUG] Response choices:", r.choices?.length || 0);

    return r.choices[0].message.content.trim();
  } catch (err) {
    console.log("[DEBUG] OpenAI API error:", err.message);
    throw err;
  }
}

// -------------------------------
// 3) MAIN PIPELINE
// -------------------------------
async function main() {
  console.log("[DEBUG] === MAIN PIPELINE STARTED ===");

  const all = await scrapeWhiteHouseNews();
  console.log("[DEBUG] All scraped articles:", all.length);
  console.log("[DEBUG] All dates found:", [...new Set(all.map(x => x.date))]);

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  console.log("[DEBUG] Filtering for date:", today);

  const todays = all.filter(x => x.date === today);
  console.log("[DEBUG] Articles matching today's date:", todays.length);

  if (todays.length === 0) {
    console.log("[DEBUG] WARNING: No articles found for date", today);
    console.log("[DEBUG] Available dates:", all.map(x => ({ title: x.title.slice(0,30), date: x.date })));
  }

  const output = { WhiteHouse: [] };

  for (let i = 0; i < todays.length; i++) {
    const item = todays[i];
    console.log(`[DEBUG] Processing article ${i + 1}/${todays.length}: "${item.title.slice(0, 50)}..."`);
    console.log(`[DEBUG] Fetching content from: ${item.link}`);

    try {
      const text = await scrapeWhiteHouseArticle(item.link);
      console.log(`[DEBUG] Article text length: ${text?.length || 0}`);

      if (!text || text.length === 0) {
        console.log("[DEBUG] WARNING: Empty text returned for article");
      }

      console.log("[DEBUG] Calling OpenAI for summary...");
      const summary = await summarize(text);
      console.log(`[DEBUG] Summary length: ${summary?.length || 0}`);

      output.WhiteHouse.push({
        title: item.title,
        date: item.date,
        summary
      });
      console.log(`[DEBUG] Article ${i + 1} completed successfully`);
    } catch (err) {
      console.log(`[DEBUG] ERROR processing article ${i + 1}:`, err.message);
      console.log("[DEBUG] Full error:", err);
    }
  }

  console.log("[DEBUG] Total articles processed:", output.WhiteHouse.length);
  const outputPath = path.join(__dirname, "whitehouse_summary.json");
  console.log("[DEBUG] Writing output to:", outputPath);

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("[DEBUG] === MAIN PIPELINE FINISHED ===");
}

await main();
console.log("WH_SUMMARY DONE")