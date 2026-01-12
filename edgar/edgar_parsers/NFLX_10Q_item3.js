import fs from "fs";
import { load } from "cheerio";
import he from "he";

function isTitleSpan(node, $) {
  if (!node) return false;

  // span or div that contains a bold/strong span
  const bold = $(node).find("span[style*='font-weight:300'], span[style*='font-weight:bold'], strong");
  if (bold.length === 0) return false;

  const text = clean($(node).text());
  if (text.length === 0 || text.length > 120) return false; // avoid paragraphs

  return true;
}

function isNTFXItem2End(node, $, text) {
  if (!text.includes("Quantitative and Qualitative Disclosures About Market Risk")) return false;
  if (node.tagName?.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-family:'times new roman'") &&
    style.includes("font-size:10pt") &&
    style.includes("font-weight:700")
  );
}
function isNTFXItem3Start(node, $, text) {
  return isNTFXItem2End(node, $, text);
}
function isNTFXItem3End(node, $, text) {
  if (!text.includes("Controls and Procedures")) return false;
  if (node.tagName?.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-family:'times new roman'") &&
    style.includes("font-size:10pt") &&
    style.includes("font-weight:700")
  );
}

function directText(node, $) {
  return clean(
    $(node)
      .clone()
      .children()
      .remove()
      .end()
      .text()
  );
}

function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// Detect Item3 start/end
function detectItem3(text) {
  const t = clean(text).toLowerCase();
  if (t.startsWith("item 3.")) return "start";
  if (t.startsWith("item 3a") || t.startsWith("item 4.")) return "end";
  return null;
}

// ---- Recursive DOM walk ----
function walk(node, callback) {
  callback(node);
  node.children?.forEach(child => walk(child, callback));
}

export function parseItem3(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let in3 = false;
  const blocks = [];
  let stop = false;

  walk(root, (node) => {
    if (!node.tagName) return;

    const tag = node.tagName.toLowerCase();
    const text = clean($(node).text());

    const direct = directText(node, $);

    // Detect boundaries
    if (isNTFXItem3Start(node, $, direct)) {
      in3 = true;
      return;
    }

    if (in3 && isNTFXItem3End(node, $, direct)) {
      stop = true;
      return;
    }
    if (stop) return;
    if (!in3) return;

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

  return { item3: blocks };
}
/*
// CLI
if (process.argv[1].includes("NFLX_10Q_parse_item3.js")) {
  const html = fs.readFileSync("edgar_raw_html/NFLX_10-Q_2025-08-01.html","utf8");
  const out = parseItem3(html);
  fs.writeFileSync("edgar_parsed_json/NFLX_10-Q_2025-08-01_item3.json", JSON.stringify(out,null,2));
  console.log("Saved NFLX_10K_item3.json");
}
*/