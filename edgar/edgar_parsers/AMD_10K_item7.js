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

  // exclude “Item 7” headings (already handled elsewhere)

  return true;
}


function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// Detect Item7 start/end
function detectItem7(text) {
  const t = clean(text).toLowerCase();
  if (t.startsWith("item 7.")) return "start";
  if (t.startsWith("item 7a") || t.startsWith("item 8.")) return "end";
  return null;
}

// ---- Recursive DOM walk ----
function walk(node, callback) {
  callback(node);
  node.children?.forEach(child => walk(child, callback));
}

export function parseItem7(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let in7 = false;
  const blocks = [];

  walk(root, (node) => {
    if (!node.tagName) return;

    const tag = node.tagName.toLowerCase();
    const text = clean($(node).text());

    // Detect boundaries
    const detect = detectItem7(text);
    if (detect === "start") { in7 = true; return; }
    if (detect === "end")   { in7 = false; return; }
    if (!in7) return;

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

  return { item7: blocks };
}
/*
// CLI
if (process.argv[1].includes("AMD_10K_parse_item7.js")) {
  const html = fs.readFileSync("edgar_raw_html/AMD_10-K_2023-11-03.html","utf8");
  const out = parseItem7(html);
  fs.writeFileSync("edgar_parsed_json/AMD_10-K_2023-11-03_item7.json", JSON.stringify(out,null,2));
  console.log("AMD_10-K_2023-11-03_item7.json");
}
*/