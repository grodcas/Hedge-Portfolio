// parse_item1.js
import fs from "fs";
import { load } from "cheerio";
import he from "he";

function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isTitleSpan(node, $) {
  if (!node || node.tagName?.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();

  // Must be blue (Intel uses #0068b5)
  const isBlue =
    style.includes("color:#0068b5") ||
    style.includes("color: rgb(0, 104, 181)");

  if (!isBlue) return false;

  // Exclude links (URLs or underlined)
  if (
    style.includes("text-decoration:underline") ||
    $(node).find("a").length > 0
  ) return false;

  const text = clean($(node).text());

  // Exclude obvious URLs just in case
  if (/^https?:\/\//i.test(text) || text.includes("www.")) return false;

  return true;
}


// -------- ITEM 1 boundary detection --------
function detectItem1(text) {
  const t = clean(text).toLowerCase();

  // Start Item 1 (Business)
  if (t.startsWith("item 1.") || t.startsWith("item 1 ")) {
    return "start";
  }

  // End when hitting Item 1A (Risk Factors)
  if (t.startsWith("item 1a") || t.startsWith("item 2.")) {
    return "end";
  }

  return null;
}

// ---------- Recursive DOM walk ----------
function walk(node, cb) {
  cb(node);
  node.children?.forEach(child => walk(child, cb));
}

export function parseItem1(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let in1 = false;
  const blocks = [];

  walk(root, (node) => {
    if (!node.tagName) return;
    const tag = node.tagName.toLowerCase();
    const text = clean($(node).text());

    // ----- detect boundaries -----
    const detect = detectItem1(text);
    if (detect === "start") { in1 = true; return; }
    if (detect === "end")   { in1 = false; return; }
    if (!in1) return;

    // ----- TABLE -----
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

    // ----- TITLE -----
    if (isTitleSpan(node, $)) {
      blocks.push({
        type: "title",
        text: clean($(node).text())
      });
      return;
    }

    // ----- PARAGRAPH TEXT -----
    if (["p","div","section","h3","h4"].includes(tag)) {
      if (text.length > 30) {
        blocks.push({ type: "text", text });
      }
    }
  });

  return { item1: blocks };
}
/*
// ---------- CLI ----------
if (process.argv[1].includes("INTC_10K_parse_item1.js")) {
  const html = fs.readFileSync("edgar_raw_html/INTC_10-K_2023-11-03.html", "utf8");
  const out = parseItem1(html);
  fs.writeFileSync("edgar_parsed_json/INTC_10-K_2023-11-03_item1.json", JSON.stringify(out, null, 2));
  console.log("Saved INTC_10K_item1.json");
}
*/