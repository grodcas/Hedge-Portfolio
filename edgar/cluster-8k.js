import fs from "fs";

export default function cluster8K(parsedJson) {
  const normalized = normalize8K(parsedJson);
  return cluster8KItems(normalized, 1000, 6000);
}


function dedupeTexts(entries) {
  const texts = [...new Set(entries.map(e => e.text.trim()))];

  return texts.filter(t =>
    !texts.some(
      other => other !== t && other.includes(t)
    )
  );
}

function normalize8K(parsedJson) {
  const byItem = {};

  for (const row of parsedJson) {
    if (!byItem[row.item]) byItem[row.item] = [];
    byItem[row.item].push(row);
  }

  const items = [];

  for (const item of Object.keys(byItem)) {
    const rows = byItem[item];
    const deduped = dedupeTexts(rows);

    items.push({
      title: `Item ${item}`,
      paragraphs: deduped
    });
  }

  return items;
}


// ===============================
// CONFIG
// ===============================
const MIN_CHARS = 1000;
const MAX_CHARS = 6000;

// ===============================
// HELPERS
// ===============================
function itemString(item) {
  let s = "TITLE: " + item.title.trim() + "\n";
  for (const p of item.paragraphs) {
    s += "TEXT: " + p.trim() + "\n";
  }
  return s;
}

function clusterString(cluster) {
  return cluster.map(itemString).join("");
}

// ===============================
// MAIN
// ===============================
function cluster8KItems(items, minChars, maxChars) {
  // keep only items with real content
  const usable = items.filter(
    it => Array.isArray(it.paragraphs) && it.paragraphs.length > 0
  );

  const clusters = [];
  let current = [];

  for (const item of usable) {
    const currLen = clusterString(current).length;
    const itemLen = itemString(item).length;

    // if adding would exceed max → close cluster
    if (currLen + itemLen > maxChars && current.length > 0) {
      clusters.push(current);
      current = [];
    }

    current.push(item);
  }

  if (current.length > 0) clusters.push(current);

  // format output
  return clusters.map((c, i) => ({
    cluster: i + 1,
    content: clusterString(c)
  }));
}

