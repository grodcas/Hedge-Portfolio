import fs from "fs";
import path from "path";

// folder with raw HTML
const RAW_DIR = "edgar/edgar_raw_html";
const OUT_DIR = "edgar/edgar_parsed_json";

const [,, START, END] = process.argv;
const startDate = new Date(START);
const endDate = new Date(END);

;(async () => {
  for (const f of fs.readdirSync(RAW_DIR)) {
    if (!f.endsWith(".html")) continue;

  // --- parse filename: TICKER_TYPE_DATE.html ---
  const base = f.replace(".html", "");
  const [ticker, type, date] = base.split("_");
  const fileDate = new Date(date);
  if (fileDate < startDate || fileDate > endDate) continue;

  const html = fs.readFileSync(path.join(RAW_DIR, f), "utf8");

  let outputs = {};

  // -------- TYPE 4 --------
  if (type === "4") {
    const mod = await import(`./edgar_parsers/${ticker}_4.js`);
    outputs = mod.parse4(html);
  }

  // -------- TYPE 8-K --------
  else if (type === "8-K") {
    const mod = await import(`./edgar_parsers/${ticker}_8K.js`);
    outputs = mod.parse8K(html);
  }

  // -------- TYPE 10-Q (items 1–3) --------
  else if (type === "10-Q") {
    for (const item of [1, 2, 3]) {
      const mod = await import(`./edgar_parsers/${ticker}_10Q_item${item}.js`);
      const fn = mod[`parseItem${item}`];
      outputs[`item${item}`] = fn(html);
    }
  }

  // -------- TYPE 10-K (items 1,7,8) --------
  else if (type === "10-K") {
    for (const item of [1, 7, 8]) {
      const mod = await import(`./edgar_parsers/${ticker}_10K_item${item}.js`);
      const fn = mod[`parseItem${item}`];
      outputs[`item${item}`] = fn(html);
    }
  }

  // -------- write output --------
  const outName = `${base}_parsed.json`;
  fs.writeFileSync(path.join(OUT_DIR, outName), JSON.stringify(outputs, null, 2));
  console.log("Saved", outName);
  }
})();

