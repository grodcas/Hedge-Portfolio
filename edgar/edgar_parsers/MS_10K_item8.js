// parse_item8.js
import fs from "fs";import { load } from "cheerio";
import he from "he";

function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isMSItem8Start(text) {
  text = clean(text)
  return text.includes("We have served as the Firm’s auditor since 1997");
}



function isMSItem8End(node, $, text) {
  if (text !== "Notes to Consolidated Financial Statements") return false;
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700") &&
    style.includes("color:#000000")
  );
}

function isTitleSpan(node, $) {
  if (!node || node.tagName?.toLowerCase() !== "span") return false;

  // ❌ Reject anything inside a table
  if ($(node).closest("table").length > 0) return false;

  const style = ($(node).attr("style") || "").toLowerCase();

  const isBold =
    style.includes("font-weight:700") ||
    style.includes("font-weight:bold") ||
    $(node).find("strong").length > 0;

  if (!isBold) return false;

  const text = clean($(node).text());
  if (!text || text.length > 120) return false;

  return true;
}



// Hard stop when hitting notes section
function isNotesSection(text) {
  const t = clean(text).toLowerCase();
  return (
    t.includes("NOTES TO CONSOLIDATED FINANCIAL STATEMENTS") ||
    t.startsWith("NOTES TO FINANCIAL STATEMENTS")
  );
}

// Recursive DOM walk
function walk(node, cb) {
  cb(node);
  node.children?.forEach(child => walk(child, cb));
}

export function parseItem8(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let inXOM = false;
  const blocks = [];
  let stop = false;

  walk(root, (node) => {
    if (!node.tagName || stop) return;

    const tag = node.tagName.toLowerCase();
    const text = clean(
      $(node)
        .clone()
        .children()
        .remove()
        .end()
        .text()
    );

    const fullText = clean($(node).text());

    if (isMSItem8Start(text)) {
      inXOM = true;
      return;
    }

    if (inXOM && isMSItem8End(node, $, text)) {
      stop = true;
      return;
    }

    if (!inXOM) return;


    // --- TABLE extraction ---
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

    // --- TITLE detection ---
    if (isTitleSpan(node, $)) {
      blocks.push({
        type: "title",
        text: clean($(node).text())
      });
      return;
    }

    // --- TEXT extraction ---
    const IS_TEXT = ["p", "div", "section", "h3", "h4"].includes(tag);
    if (IS_TEXT && fullText.length > 30) {
      blocks.push({
        type: "text",
        fullText
      });
    }
  });

  return { item8: blocks };
}
/*
// CLI usage
if (process.argv[1].includes("MS_10K_parse_item8.js")) {
  const html = fs.readFileSync("edgar_raw_html/MS_10-K_2023-11-03.html", "utf8");
  const out = parseItem8(html);
  fs.writeFileSync("edgar_parsed_json/MS_10-K_2023-11-03_item8.json", JSON.stringify(out, null, 2));
  console.log("MS_10-K_2023-11-03_item8.json");
}
*/