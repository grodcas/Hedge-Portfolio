import fs from "fs";
import path from "path";

import cluster4 from "./cluster_4.js";
import cluster8K from "./cluster_8K.js";
import clusterKQ from "./cluster_K_Q.js";

const INPUT_DIR = "edgar/edgar_parsed_json";
const OUTPUT_DIR = "edgar/edgar_clustered_json";

const [,, START, END] = process.argv;
const startDate = new Date(START);
const endDate = new Date(END);


fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith(".json"));

for (const file of files) {

  const base = file.replace("_parsed.json", "");
  const [, , date] = base.split("_");
  const fileDate = new Date(date);

  if (fileDate < startDate || fileDate > endDate) continue;

  const inputPath = path.join(INPUT_DIR, file);
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  const outName = file.replace("_parsed.json", "_clustered.json");
  const outPath = path.join(OUTPUT_DIR, outName);



  let clustered = null;

  // ---------- FORM 4 ----------
  if (file.includes("_4_")) {
    clustered = cluster4(raw);
    if (!clustered) {
      fs.writeFileSync(outPath, JSON.stringify({}, null, 2));
      continue;
    }

  }

  // ---------- 8-K ----------
  else if (file.includes("_8-K_")) {
    clustered = cluster8K(raw);
    if (!clustered) {
      fs.writeFileSync(outPath, JSON.stringify({}, null, 2));
      continue;
    }

  }

  // ---------- 10-K / 10-Q ----------
  else if (file.includes("_10-K_") || file.includes("_10-Q_")) {
    clustered = clusterKQ(raw, file);
    if (!clustered) {
      fs.writeFileSync(outPath, JSON.stringify({}, null, 2));
      continue;
    }

  }

  // ---------- UNKNOWN ----------
  else {
    console.log("SKIP (unknown type):", file);
    continue;
  }

  fs.writeFileSync(outPath, JSON.stringify(clustered, null, 2));
  console.log("CLUSTERED:", outName);
}

console.log("DONE: all parsed filings clustered.");
