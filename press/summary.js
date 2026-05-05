import "dotenv/config";

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("PRESS SUMMARY STARTED")

const ts = () => new Date().toISOString().slice(11, 19);

// ----------------------
// OPENAI CLIENT
// ----------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 1,
});

// ----------------------
// LOAD TICKER RESULTS
// ----------------------
const base = JSON.parse(
  fs.readFileSync(path.join(__dirname, "AA_press_releases_today.json"), "utf8")
).results;

const tickers = Object.keys(base);

// Idempotency: load any existing summary file and skip articles whose URL
// is already summarized. The previous behavior was to overwrite the whole
// file from scratch, so a hang on article 1 lost everything.
const summaryPath = path.join(__dirname, "AA_press_summary.json");
let priorOutput = {};
try {
  if (fs.existsSync(summaryPath)) {
    priorOutput = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  }
} catch (err) {
  console.error(`[${ts()}] [PRESS-SUMMARY] could not read prior summary: ${err.message}`);
}

function alreadySummarized(ticker, url) {
  const existing = priorOutput[ticker];
  if (!Array.isArray(existing)) return false;
  return existing.some(a => a.url === url || a.heading === url);
}

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
    const timer = setTimeout(() => {
      console.log(`[${ts()}] [PRESS-SUMMARY] article scrape TIMEOUT 45s → SIGKILL ${ticker}`);
      child.kill("SIGKILL");
      resolve("");
    }, 45000);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.trim());
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.log(`[${ts()}] [PRESS-SUMMARY] article scraper spawn error ${ticker}: ${err.message}`);
      resolve("");
    });
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
  const totalArticles = tickers.reduce((n, t) => n + (base[t]?.length || 0), 0);
  let processed = 0;
  console.log(`[${ts()}] [PRESS-SUMMARY] ${tickers.length} tickers, ${totalArticles} articles to process`);

  for (const ticker of tickers) {
    const articles = base[ticker];
    if (!articles || articles.length === 0) continue;

    output[ticker] = [];

    for (const art of articles) {
      processed++;
      const tag = `[${ts()}] [PRESS-SUMMARY ${processed}/${totalArticles}] ${ticker}`;

      if (alreadySummarized(ticker, art.url)) {
        console.log(`${tag} SKIP (already summarized) ${art.url}`);
        const prior = priorOutput[ticker].find(a => a.url === art.url || a.heading === art.url);
        if (prior) output[ticker].push(prior);
        continue;
      }

      const aStart = Date.now();
      console.log(`${tag} scrape ${art.url}`);
      const text = await runArticleScraper(ticker, art.url);
      console.log(`${tag} scraped ${text?.length ?? 0} chars in ${Date.now() - aStart}ms`);

      let result;
      try {
        const sStart = Date.now();
        result = await summarize(text);
        console.log(`${tag} summarized in ${Date.now() - sStart}ms (${result.sentiment}, mag=${result.magnitude})`);
      } catch (err) {
        console.error(`${tag} summarize FAILED: ${err.message}`);
        result = { summary: `[summarize-failed: ${err.message}]`, sentiment: "neutral", magnitude: 0 };
      }

      const entry = {
        heading: art.title,
        url: art.url,
        date: art.norm,
        summary: result.summary,
        sentiment: result.sentiment,
        magnitude: result.magnitude,
        rawContent: text,
      };
      output[ticker].push(entry);

      // Persist after every article so a crash doesn't wipe all progress.
      fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2));
    }
  }

  fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2));
  console.log(`[${ts()}] [PRESS-SUMMARY] wrote ${summaryPath} (${Object.keys(output).length} tickers)`);
}

await main();

console.log("PRESS SUMMARY DONE")

