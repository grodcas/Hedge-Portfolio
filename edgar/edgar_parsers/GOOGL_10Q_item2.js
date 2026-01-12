import fs from "fs";
import { load } from "cheerio";
import he from "he";

function isTitleSpan(node, $) {
  if (!node) return false;

  // span or div that contains a bold/strong span
  const bold = $(node).find("span[style*='font-weight:700'], span[style*='font-weight:bold'], strong");
  if (bold.length === 0) return false;

  const text = clean($(node).text());
  if (text.length === 0 || text.length > 120) return false; // avoid paragraphs

  // exclude “Item 2” headings (already handled elsewhere)


  return true;
}


function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// Detect Item2 start/end
function detectItem2(text) {
  const t = clean(text).toLowerCase();
  if (t.startsWith("item 2.")) return "start";
  if (t.startsWith("item 2a") || t.startsWith("item 3.") || t.startsWith("item 4.") || t.startsWith("item 5.") || t.startsWith("item 6.") || t.startsWith("item 7.") || t.startsWith("item 8.")) return "end";
  return null;
}


// ---- Recursive DOM walk ----
function walk(node, callback) {
  callback(node);
  node.children?.forEach(child => walk(child, callback));
}

export function parseItem2(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let in2 = false;
  const blocks = [];

  walk(root, (node) => {
    if (!node.tagName) return;

    const tag = node.tagName.toLowerCase();
    const text = clean($(node).text());

    // Detect boundaries
    const detect = detectItem2(text);
    if (detect === "start") { in2 = true; return; }
    if (detect === "end")   { in2 = false; return; }
    if (!in2) return;

    // TABLE
    if (tag === "table") {
      const rows = [];
      $(node).find("tr").each((_, tr) => {
        const cells = [];
        $(tr).find("th,td").each((__, td) => {
          cells.push(clean($(td).text()));
        });
        if (cells.some(x => x)) rows.push(cells);
      });
      if (rows.length) {
        blocks.push({ type: "table", rows });
      }
      return;
    }

    // ---- TITLE? (bold span/div) ----
    if (isTitleSpan(node, $)) {
      blocks.push({
        type: "title",
        text: clean($(node).text())
      });
      return;
    }

    // TEXT
    if (["p","div","section","h3","h4"].includes(tag)) {
      if (text.length > 30) {
        blocks.push({ type: "text", text });
      }
    }
  });

  return { item2: blocks };
}
/*
// CLI
if (process.argv[1].includes("GOOGL_10Q_parse_item2.js")) {
  const html = fs.readFileSync("edgar_raw_html/GOOGL_10-Q_2025-08-01.html","utf8");
  const out = parseItem2(html);
  fs.writeFileSync("edgar_parsed_json/GOOGL_10-Q_2025-08-01_item2.json", JSON.stringify(out,null,2));
  console.log("Saved GOOGL_10K_item2.json");
}
*/