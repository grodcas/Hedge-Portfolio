import fs from "fs";

export default function cluster4(parsedJson) {
  // existing Form 4 clustering logic
  return clusterForm4(parsedJson, 500, 6000);
}


// ===============================
// CONFIG
// ===============================
const MIN_CHARS = 500;
const MAX_CHARS = 6000;

const VALID_CODES = new Set([
  "P", "S", "A", "D", "F", "M", "C", "I", "G"
]);

// ===============================
// VALIDATION
// ===============================
function isValidDate(d) {
  return !isNaN(Date.parse(d));
}

function isValidItem(it) {
  if (!isValidDate(it.date)) return false;
  if (!VALID_CODES.has(it.code)) return false;

  if (
    typeof it.amount !== "number" ||
    typeof it.price !== "number" ||
    typeof it.after !== "number" 
  ) return false;

  if (
    !it.direction ||
    typeof it.direction !== "string"
  ) return false;

  return true;
}

// ===============================
// STRING BUILDERS
// ===============================
function itemString(it) {
  return (
    `SECURITY: ${it.security}\n` +
    `DATE: ${it.date}\n` +
    `CODE: ${it.code}\n` +
    `DIRECTION: ${it.direction}\n` +
    `AMOUNT: ${it.amount}\n` +
    `PRICE: ${it.price}\n` +
    `AFTER: ${it.after}\n` +
    `CHANGE_PCT: ${it.change_pct}\n`
  );
}

function clusterString(cluster) {
  return cluster.map(itemString).join("\n");
}

// ===============================
// CLUSTERING
// ===============================
function clusterForm4(items, minChars, maxChars) {
  const valid = items.filter(isValidItem);

  const clusters = [];
  let current = [];

  for (const it of valid) {
    const currLen = clusterString(current).length;
    const itLen = itemString(it).length;

    if (currLen + itLen > maxChars && current.length > 0) {
      clusters.push(current);
      current = [];
    }

    current.push(it);
  }

  if (current.length > 0) clusters.push(current);

  return clusters.map((c, i) => ({
    cluster: i + 1,
    content: clusterString(c)
  }));
}

// ===============================
// EXECUTION
// ===============================
const data = JSON.parse(
  fs.readFileSync("edgar_parsed_json/AAPL_4_2025-11-12_parsed.json", "utf8")
);

const out = clusterForm4(data, MIN_CHARS, MAX_CHARS);

fs.writeFileSync(
  "edgar_clustered_json/AAPL_FORM4_clusters.json",
  JSON.stringify(out, null, 2)
);

console.log("DONE: Form 4 clustered.");
