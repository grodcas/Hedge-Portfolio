import fs from "fs";
import path from "path";
import qp from "quoted-printable";
import iconv from "iconv-lite";
import { load } from "cheerio";
import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const __dirname = process.cwd();
const date = new Date().toISOString().slice(0, 10);

// -------------------------------------------------
// PORTFOLIO
// -------------------------------------------------

const PORTFOLIO = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","BRK.B","JPM","GS","BAC",
  "XOM","CVX","UNH","LLY","JNJ","PG","KO","HD","CAT","BA","INTC","AMD","NFLX","MS"
];

// -------------------------------------------------
// PARSERS
// -------------------------------------------------

function parseBloomberg(path) {
  // Bloomberg HTML also often encoded as quoted-printable → must decode
  const raw = fs.readFileSync(path, "utf8");
  const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(decoded);

  // Headline
  const headline =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text().trim();

  // Extract paragraphs
  let paragraphs = [];

  // Bloomberg MAIN selector
  $('p[data-component="paragraph"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0) paragraphs.push(t);
  });

  return {
    headline,
    text: paragraphs.join("\n\n"),
  };
}


function parseWSJ(path) {
  // WSJ HTML also uses =3D etc. → decode first
  const raw = fs.readFileSync(path, "utf8");
  const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(decoded);

  // Headline: WSJ stores multiple meta variants
  const headline =
    $('meta[name="article.headline"]').attr("content") ||
    $('meta[name="article.origheadline"]').attr("content") ||
    $("h1").first().text().trim();

  // Extract all WSJ article paragraphs
  let paragraphs = [];
  $('p[data-type="paragraph"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length) paragraphs.push(t);
  });

  return {
    headline,
    text: paragraphs.join("\n\n"),
  };
}

function parseReuters(path) {
  // decode =3D etc.
  const raw = fs.readFileSync(path, "utf8");
  const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(decoded);

  // Headline
  const headline =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text().trim();

  // Real article text paragraphs
  let paragraphs = [];

  $('div[data-testid^="paragraph-"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0) paragraphs.push(t);
  });

  return {
    headline,
    text: paragraphs.join("\n\n")
  };
}
// -------------------------------------------------
// OPENAI CALLS
// -------------------------------------------------

async function summarize(text) {
  const prompt = `
Summarize this article in short, neutral, factual English.
No opinions. No fluff.

TEXT:
${text}
`;

  const r = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return r.choices[0].message.content.trim();
}

async function detectTickers(text) {
  const prompt = `
You are given a financial news article.

From the following portfolio:
${PORTFOLIO.join(", ")}

Return a JSON array of tickers that are:
- The main subject of the article, OR
- Strongly impacted (M&A, earnings, litigation, regulation)

If none, return [].
Only return valid JSON. No text.

ARTICLE:
${text}
`;

  const r = await client.chat.completions.create({
    model: "o3-mini",
    messages: [{ role: "user", content: prompt }]
  });

  try {
    return JSON.parse(r.choices[0].message.content);
  } catch {
    return [];
  }
}

// -------------------------------------------------
// MAIN PROCESS
// -------------------------------------------------

async function processFolder(folderName, parser) {
  const folderPath = path.join(__dirname, folderName);
  const files = fs.readdirSync(folderPath);

  const results = [];

  for (const file of files) {
    if (!file.endsWith(".mhtml")) continue;

    const id = path.parse(file).name;
    const filePath = path.join(folderPath, file);

    const { headline: heading, text } = parser(filePath);
    fs.writeFileSync(path.join(__dirname, `${id}.txt`), text);

    const summary = await summarize(text);
    const tickers = await detectTickers(text);

    results.push({
      heading,
      date,
      tickers,
      summary
    });
  }

  return results;
}

// -------------------------------------------------
// RUN
// -------------------------------------------------

async function main() {
  const output = {};

  output.Bloomberg = await processFolder("BLOOMBERG", parseBloomberg);
  output.WSJ       = await processFolder("WSJ", parseWSJ);
  output.Reuters   = await processFolder("REUTERS", parseReuters);

  fs.writeFileSync(
    path.join(__dirname, "news_summary.json"),
    JSON.stringify(output, null, 2)
  );
}

main();
