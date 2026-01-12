import fs from "fs";
import { load } from "cheerio";
import he from "he";

function isTitleSpan(node, $) {
  if (!node) return false;

  // span or div that contains a bold/strong span
  const bold = $(node).find("span[style*='font-weight:700'], span[style*='font-weight:bold'], strong");
  if (bold.length === 0) return false;

  const text = clean(
    $(node)
      .clone()
      .children()
      .remove()
      .end()
      .text()
  );
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

function isJPMItem7Start(node, $, text) {
  if (text !== "EXECUTIVE OVERVIEW") return false;
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("color:#000000")
  );
}


function isJPMItem7End(node, $, text) {
  if (text !== "Other risk measures") return false;
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700") &&
    style.includes("color:#000000")
  );
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

    if (isJPMItem7Start(node, $, text)) {
      in7 = true;
      return;
    }

    if (in7 && isJPMItem7End(node, $, text)) {
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
if (process.argv[1].includes("JPM_10K_parse_item7.js")) {
  const html = fs.readFileSync("edgar_raw_html/JPM_10-K_2023-11-03.html","utf8");
  const out = parseItem7(html);
  fs.writeFileSync("edgar_parsed_json/JPM_10-K_2023-11-03_item7.json", JSON.stringify(out,null,2));
  console.log("JPM_10-K_2023-11-03_item7.json");
}
*/