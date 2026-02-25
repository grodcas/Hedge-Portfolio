import fs from "fs";

export default function clusterKQ(parsedJson, filename) {

  // -------- 10-K --------
  if (filename.includes("_10-K_")) {
    if (!parsedJson.item7?.item7 || !parsedJson.item8?.item8) {
      console.log("SKIP malformed 10-K:", filename);
      return null;
    }

    return {
      item7: makeClusters("7", parsedJson.item7.item7, 3000, 6000),
      item8: makeClusters("8", parsedJson.item8.item8, 3000, 6000)
    };
  }

  // -------- 10-Q --------
  if (filename.includes("_10-Q_")) {
    if (
      !parsedJson.item1?.item1 ||
      !parsedJson.item2?.item2 ||
      !parsedJson.item3?.item3
    ) {
      console.log("SKIP malformed 10-Q:", filename);
      return null;
    }

    return {
      item1: makeClusters("1", parsedJson.item1.item1, 3000, 6000),
      item2: makeClusters("2", parsedJson.item2.item2, 3000, 6000),
      item3: makeClusters("3", parsedJson.item3.item3, 3000, 6000)
    };
  }

  console.log("SKIP unknown type:", filename);
  return null;
}

// ==========================================================
// BASIC HELPERS
// ==========================================================

function buildClusterSummary(clusterSections) {
  const stopwords = new Set([
    "the","and","for","with","that","this","from","were","was","are",
    "have","has","had","into","over","under","between","including",
    "compared","year","years","ended","million","millions","billion",
    "percent","increase","decrease"
  ]);

  const freq = {};

  for (const section of clusterSections) {
    for (const blk of section) {
      if (blk.type !== "text") continue;

      const words = blk.text
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter(w =>
          w.length >= 4 &&
          !stopwords.has(w)
        );

      for (const w of words) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }

  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  if (keywords.length === 0) return "";

  return (
    "CLUSTER SUMMARY (KEYWORDS):\n" +
    keywords.join(", ") +
    "\n\n"
  );
}



function blockString(blk) {
  return blk.type.toUpperCase() + ": " + blk.text + "\n";
}

function cleanTitle(t) {
  if (typeof t !== "string") return "";
  return t.replace(/\s+/g, " ").trim();
}

function cleanText(t) {
  if (typeof t !== "string") return "";
  return t.replace(/\s+/g, " ").trim();
}

// ==========================================================
// TABLE NORMALIZATION (IMPROVED)
// ==========================================================

function flattenTable(table) {
  const rows = table.rows || [];
  if (rows.length < 2) return "";

  const header = rows[0].map(x => (x || "").trim()).filter(Boolean);

  // detect year-based column header
  const years = header.filter(x => /^\d{4}$/.test(x));
  if (years.length >= 2) {
    const result = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].map(x => (x || "").trim());
      const label = row[0];
      if (!label) continue;

      let values = [];
      let colIdx = 0;

      for (let j = 1; j < row.length && colIdx < years.length; j++) {
        if (row[j] && row[j].match(/^[\d,(]+/)) {
          values.push(`${years[colIdx]}: ${row[j]}`);
          colIdx++;
        }
      }

      if (values.length > 0) {
        result.push(`TABLE_ROW: ${label} — ${values.join("; ")}`);
      }
    }

    return result.join("\n");
  }

  // fallback (original behavior)
  const facts = [];
  for (const row of rows) {
    const cleaned = row.map(x => (x || "").trim()).filter(x => x !== "");
    if (cleaned.length >= 2) facts.push(cleaned.join(" "));
  }
  return "TABLE: " + facts.join("; ") + ".";
}

// ==========================================================
// NORMALIZE BLOCKS + DEDUPE
// ==========================================================

function buildSequentialBlocks(itemArray) {
  const blocks = [];

  for (const entry of itemArray) {
    const rawText =
      typeof entry.text === "string" ? entry.text :
      typeof entry.t === "string" ? entry.t :
      "";

    if (entry.type === "table") {
      const flat = flattenTable(entry);
      if (flat) blocks.push({ type: "table", text: flat });
      continue;
    }

    if (entry.type === "title") {
      const ttl = cleanTitle(rawText);
      if (ttl) blocks.push({ type: "title", text: ttl });
      continue;
    }

    if (entry.type === "text") {
      const cleaned = cleanText(rawText);
      if (cleaned) blocks.push({ type: "text", text: cleaned });
    }
  }

  // remove consecutive identical blocks
  const deduped = [];
  for (const blk of blocks) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.type === blk.type && prev.text === blk.text) continue;
    deduped.push(blk);
  }

  return deduped;
}

// ==========================================================
// SECTIONS (TITLE-BASED)
// ==========================================================

function makeSections(blocks) {
  const sections = [];
  let current = [];
  let discard = false;

  function isNoteTitle(blk) {
    return (
      blk.type === "title" &&
      blk.text.toLowerCase().startsWith("note")
    );
  }

  for (const blk of blocks) {
    if (blk.type === "title") {
      if (!discard && current.length > 0) sections.push(current);
      current = [];
      discard = isNoteTitle(blk);
      if (discard) continue;
    }

    if (!discard) current.push(blk);
  }

  if (!discard && current.length > 0) sections.push(current);
  return sections;
}

// ==========================================================
// STRING BUILDERS
// ==========================================================

function sectionString(section) {
  return section.map(blockString).join("");
}

function clusterString(clusterSections) {
  return clusterSections.flat().map(blockString).join("");
}

// ==========================================================
// SPLIT OVERSIZED SECTIONS
// ==========================================================

function splitOversizedSectionAtBlockBoundaries(section, maxChars) {
  const parts = [];
  let current = [];
  let len = 0;

  for (const blk of section) {
    const s = blockString(blk);
    if (len + s.length > maxChars && current.length > 0) {
      parts.push(current);
      current = [];
      len = 0;
    }
    current.push(blk);
    len += s.length;
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

// ==========================================================
// MAIN CLUSTERING
// ==========================================================

function makeClusters(itemName, itemArray, minChars, maxChars) {
  const blocks = buildSequentialBlocks(itemArray);
  const sections = makeSections(blocks);

  const clusters = [];
  let current = [];

  for (const section of sections) {
    const parts = splitOversizedSectionAtBlockBoundaries(section, maxChars);

    for (const part of parts) {
      const partLen = sectionString(part).length;
      const currLen = clusterString(current).length;

      if (currLen + partLen <= maxChars) {
        current.push(part);
      } else {
        if (current.length > 0) clusters.push(current);
        current = [part];
      }
    }
  }

  if (current.length > 0) clusters.push(current);

  return clusters.map((c, i) => ({
    cluster: i + 1,
    content:
      `ITEM ${itemName}:\n` +
      buildClusterSummary(c) +
      c.flat().map(blockString).join("")
  }));

}
