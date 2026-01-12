import fs from "fs";
import { load } from "cheerio";
import he from "he";

function isTitleSpan(node, $) {
  if (!node || node.tagName?.toLowerCase() !== "span") return false;

  // ❌ Exclude tables
  if ($(node).closest("table").length) return false;

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



function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isXOMItem7Start(text) {
  const t = clean(text);
  return (
    t.includes("MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS") ||
    t.includes("OVERVIEW")
  );
}

function isXOMItem7End(text) {
  const t = clean(text);
  return t === "CRITICAL ACCOUNTING ESTIMATES";
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
  let stop = false; 

  walk(root, (node) => {
    if (!node.tagName) return;

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


    if (isXOMItem7Start(text)) {
      in7 = true;
      return;
    }

    if (in7 && isXOMItem7End(text)) {
      stop = true;
      return;
    }

    if (!in7 || stop) return;

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
      if (fullText.length > 30) {
        blocks.push({ type: "text", fullText });
      }
    }
  });

  return { item7: blocks };
}
/*
// CLI
if (process.argv[1].includes("XOM_10K_parse_item7.js")) {
  const html = fs.readFileSync("edgar_raw_html/XOM_10-K_2023-11-03.html","utf8");
  const out = parseItem7(html);
  fs.writeFileSync("edgar_parsed_json/XOM_10-K_2023-11-03_item7.json", JSON.stringify(out,null,2));
  console.log("XOM_10-K_2023-11-03_item7.json");
}
*/