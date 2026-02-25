import fs from "fs";
import path from "path";

const DIR = "edgar_parsed_json";
const out = {};

function evalItemBlocks(blocks, ticker, type, itemKey, file) {
  if (!Array.isArray(blocks)) {
    console.warn(`[WARN] ${ticker} ${type} ${itemKey} in ${file} is not an array`);
    return { texts: 0, titles: 0, tables: 0, rows: 0 };
  }

  let texts = 0, titles = 0, tables = 0, rows = 0;

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "text") texts++;
    else if (b.type === "title") titles++;
    else if (b.type === "table") {
      tables++;
      if (Array.isArray(b.rows)) rows += b.rows.length;
    }
  }
  return { texts, titles, tables, rows };
}

function eval10X(data, ticker, type, file) {
  const res = {};

  for (const [itemKey, content] of Object.entries(data)) {
    // CASE A: 10-K style → item8: [ ... ]
    if (Array.isArray(content)) {
      res[itemKey] = evalItemBlocks(content, ticker, type, itemKey, file);
      continue;
    }

    // CASE B: 10-Q style → item1: { item1: [ ... ] }
    if (typeof content === "object" && content !== null) {
      const inner = content[itemKey];
      if (!inner) {
        console.warn(`[WARN] ${ticker} ${type} ${itemKey} missing inner array in ${file}`);
        continue;
      }
      res[itemKey] = evalItemBlocks(inner, ticker, type, itemKey, file);
      continue;
    }

    console.warn(`[WARN] ${ticker} ${type} ${itemKey} has unknown structure in ${file}`);
  }

  if (Object.keys(res).length === 0)
    console.warn(`[WARN] No valid items found for ${ticker} ${type} in ${file}`);

  return res;
}

function evalForm4(arr, ticker, file) {
  const validCodes = new Set(["M", "F", "S", "P", "G"]);
  const res = { amount_numeric: 0, amount_non_numeric: 0, code_valid: 0, code_invalid: 0 };

  if (!Array.isArray(arr)) {
    console.warn(`[WARN] Form 4 for ${ticker} not array in ${file}`);
    return res;
  }

  for (const e of arr) {
    const n = Number(e.amount);
    if (Number.isFinite(n)) res.amount_numeric++; else res.amount_non_numeric++;

    const c = String(e.code || "").trim();
    if (validCodes.has(c)) res.code_valid++; else res.code_invalid++;
  }
  return res;
}

function eval8K(arr, ticker, file) {
  if (!Array.isArray(arr)) {
    console.warn(`[WARN] 8-K for ${ticker} not array in ${file}`);
    return { total_items: 0, items_with_paragraphs: 0, items_without_paragraphs: 0 };
  }

  let total = 0, withP = 0;

  for (const sec of arr) {
    total++;
    if (Array.isArray(sec.paragraphs) && sec.paragraphs.length > 0) withP++;
  }

  return {
    total_items: total,
    items_with_paragraphs: withP,
    items_without_paragraphs: total - withP
  };
}

(async () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    console.log(`Processing: ${file}`);

    const full = path.join(DIR, file);
    const data = JSON.parse(fs.readFileSync(full, "utf8"));

    const parts = file.replace(".json", "").split("_");
    if (parts.length < 3) {
      console.warn(`[WARN] Unexpected filename format: ${file}`);
      continue;
    }

    const ticker = parts[0];
    const type = parts[1]; // "10-K", "10-Q", "4", "8-K"

    out[ticker] ||= {};

    if (type === "10-K" || type === "10-Q") {
      out[ticker][type] = eval10X(data, ticker, type, file);
    } else if (type === "4") {
      out[ticker][type] = evalForm4(data, ticker, file);
    } else if (type === "8-K") {
      out[ticker][type] = eval8K(data, ticker, file);
    } else {
      console.warn(`[WARN] Unknown type ${type} in ${file}`);
    }
  }

  fs.writeFileSync("edgar_parsed_json_report.json", JSON.stringify(out, null, 2));
  console.log(`Saved edgar_parsed_json_report.json`);
})();
