import fs from "fs";

// ---------- SIMPLE INGESTIONS ----------

await import("./edgar/AA_EDGAR_SHORT_TERM.js");
//await import("./macro/macro_summary.js");
await import("./sentiment/sentiment_summary.js");

const macroJson = JSON.parse(fs.readFileSync("macro/macro_summary.json", "utf8"));
const newsJson = JSON.parse(fs.readFileSync("news/news_summary.json", "utf8"));
const pressJson = JSON.parse(fs.readFileSync("press/AA_press_summary.json", "utf8"));
const sentimentJson = JSON.parse(fs.readFileSync("sentiment/sentiment_summary.json", "utf8"));
const whitehouseJson = JSON.parse(fs.readFileSync("whitehouse/whitehouse_summary.json", "utf8"));


await fetch("https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/macro", {
  method: "POST",
  body: JSON.stringify(macroJson),
  headers: { "Content-Type": "application/json" }
});


await fetch("https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/sentiment", {
  method: "POST",
  body: JSON.stringify(sentimentJson),
  headers: { "Content-Type": "application/json" }
});

/*
await fetch("https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/news", {
  method: "POST",
  body: JSON.stringify(newsJson),
  headers: { "Content-Type": "application/json" }
});

await fetch("https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/press", {
  method: "POST",
  body: JSON.stringify(pressJson),
  headers: { "Content-Type": "application/json" }
});

await fetch("https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/whitehouse", {
  method: "POST",
  body: JSON.stringify(whitehouseJson),
  headers: { "Content-Type": "application/json" }
});

// ---------- EDGAR LOCAL INGESTION ----------
*/
// MUST be set before import
process.env.INGEST_URL =
  "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev/ingest/reports";


// This runs the heavy local EDGAR pipeline
await import("./edgar/edgar_clustered_json/AA_ingestor.js");
