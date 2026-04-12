import "dotenv/config";

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("PRESS SUMMARY STARTED")


// ----------------------
// OPENAI CLIENT
// ----------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,   // <-- SET YOUR KEY IN ENV
});

// ----------------------
// LOAD TICKER RESULTS
// ----------------------
const base = JSON.parse(
  fs.readFileSync(path.join(__dirname, "AA_press_releases_today.json"), "utf8")
).results;

const tickers = Object.keys(base);

// ----------------------
// RUN ARTICLE SCRAPER
// ----------------------
function runArticleScraper(ticker, url) {
  return new Promise((resolve) => {
    const file = path.join(__dirname, "articles", `${ticker}.js`);
    const child = spawn("node", [file, url], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => resolve(out.trim()));
  });
}

// ----------------------
// CALL OPENAI
// ----------------------
async function summarize(text) {
  const prompt = `
Analyze the following press release. Output JSON ONLY, no commentary.

TASK 1: Write a short factual summary (plain English, no opinions, no spin, no analysis — just key facts).

TASK 2: Classify the EVENT TYPE (not the tone):
- "sentiment": one of "bullish", "bearish", "neutral"
- "magnitude": 0.0 to 1.0, how material this event is for shareholders

CRITICAL RULES:
- IGNORE the press release's tone. Companies always spin positively.
- Judge the underlying EVENT, not the wording.
- "Layoffs", "restructuring", "guidance cut", "product recall", "SEC investigation" → bearish (regardless of positive spin).
- "Earnings beat", "new major contract", "FDA approval", "flagship product launch", "large buyback" → bullish.
- "Minor product update", "routine leadership appointment", "conference attendance" → neutral with low magnitude.
- Magnitude reflects market impact: 0.1 = routine, 0.5 = notable, 0.9 = very material.

OUTPUT (strict JSON, no markdown, no extra text):
{
  "summary": "factual 1-3 sentence summary",
  "sentiment": "bullish" | "bearish" | "neutral",
  "magnitude": 0.0
}

TEXT:
${text}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const raw = res.choices[0].message.content.trim();
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary || "",
      sentiment: ["bullish", "bearish", "neutral"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
      magnitude: typeof parsed.magnitude === "number" ? Math.max(0, Math.min(1, parsed.magnitude)) : 0,
    };
  } catch (err) {
    console.error("Failed to parse press summary JSON:", err.message);
    return { summary: raw.slice(0, 500), sentiment: "neutral", magnitude: 0 };
  }
}

// ----------------------
// MAIN
// ----------------------
async function main() {
  const output = {};

  for (const ticker of tickers) {
    const articles = base[ticker];
    if (!articles || articles.length === 0) continue;

    output[ticker] = [];

    for (const art of articles) {
      const text = await runArticleScraper(ticker, art.url);
      console.log(art.title)
      const result = await summarize(text);

      output[ticker].push({
        heading: art.title,
        date: art.norm,
        summary: result.summary,
        sentiment: result.sentiment,
        magnitude: result.magnitude,
        rawContent: text,  // Save raw content for verification
      });
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "AA_press_summary.json"),
    JSON.stringify(output, null, 2)
  );
}

await main();

console.log("PRESS SUMMARY DONE")

