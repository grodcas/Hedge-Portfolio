// parse_item8.js
import fs from "fs";
import { load } from "cheerio";
import he from "he";

function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isJPMItem8Start(node, $, text) {
  if (text !== "Consolidated statements of income") return false;
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700")
  );
}


function isJPMItem8End(node, $, text) {
  if (text !== "Notes to consolidated financial statements") return false;
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700")
  );
}



// Detect bold-span titles (same logic as item 7)
function isTitleSpan(node, $) {
  const bold = $(node).find(
    "span[style*='font-weight:700'], span[style*='font-weight:bold'], strong"
  );
  if (bold.length === 0) return false;

  const text = clean(
    $(node)
      .clone()
      .children()
      .remove()
      .end()
      .text()
  );
  if (!text || text.length > 140) return false;



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


    if (isJPMItem8Start(node, $, text)) {
      inXOM = true;
      return;
    }

    if (inXOM && isJPMItem8End(node, $, text)) {
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
if (process.argv[1].includes("JPM_10K_parse_item8.js")) {
  const html = fs.readFileSync("edgar_raw_html/JPM_10-K_2023-11-03.html", "utf8");
  const out = parseItem8(html);
  fs.writeFileSync("edgar_parsed_json/JPM_10-K_2023-11-03_item8.json", JSON.stringify(out, null, 2));
  console.log("JPM_10-K_2023-11-03_item8.json");
}
*/