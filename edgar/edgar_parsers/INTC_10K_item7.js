import fs from "fs";
import { load } from "cheerio";
import he from "he";

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

  // Title-like length
  if (!text || text.length > 120) return false;

  // Exclude obvious URLs just in case
  if (/^https?:\/\//i.test(text) || text.includes("www.")) return false;

  return true;
}


function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}



function isINTCItem7Start(node, $, text) {
  if (text !== "Consolidated Results of Operations") return false;

  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  const parentTd = $(node).closest("td");

  return (
    style.includes("color:#ffffff") &&
    style.includes("font-size:18pt") &&
    parentTd.attr("style")?.toLowerCase().includes("background-color:#004a86")
  );
}


function isINTCItem7End(node, $, text) {
  if (text !== "Risk Factors") return false;

  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();

  return (
    style.includes("font-size:14pt") &&
    style.includes("color:#0068b5")
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


    if (isINTCItem7Start(node, $, text)) {
      in7 = true;
      return;
    }

    if (in7 && isINTCItem7End(node, $, text)) {
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
if (process.argv[1].includes("INTC_10K_parse_item7.js")) {
  const html = fs.readFileSync("edgar_raw_html/INTC_10-K_2023-11-03.html","utf8");
  const out = parseItem7(html);
  fs.writeFileSync("edgar_parsed_json/INTC_10-K_2023-11-03_item7.json", JSON.stringify(out,null,2));
  console.log("INTC_10-K_2023-11-03_item7.json");
}
*/