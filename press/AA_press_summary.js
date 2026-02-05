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
// RUN TICKER_2 SCRAPER
// ----------------------
function runArticleScraper(ticker, url) {
  return new Promise((resolve) => {
    const file = path.join(__dirname, `${ticker}_2.js`);
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
Summarize the following press release into a short, factual, plain-English summary.

Do NOT add opinions.
Do NOT add analysis.
Focus only on key facts.

TEXT:
${text}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return res.choices[0].message.content.trim();
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
      console.log(text)
      const summary = await summarize(text);

      output[ticker].push({
        heading: art.title,
        date: art.norm,
        summary: summary,
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

