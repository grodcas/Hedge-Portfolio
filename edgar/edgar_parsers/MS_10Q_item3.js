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

function isMSBold12pt(node, $, needle) {
  if (node.tagName?.toLowerCase() !== "span") return false;

  const text = directText(node, $);
  if (!text.includes(needle)) return false;

  const style = ($(node).attr("style") || "").toLowerCase();
  return (
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700") &&
    style.includes("color:#000000")
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

function isMSItem3Start(node, $, text) {
  return isMSItem2End(node, $, text);
}

function isMSItem3End(node, $, text) {
  return isMSBold12pt(node, $, "Risk Disclosures");
}
function isMSItem2End(node, $, text) {
  return isMSBold12pt(
    node,
    $,
    "Quantitative and Qualitative Disclosures about Risk"
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
    if (isMSItem3Start(node, $, direct)) {
      in3 = true;
      return;
    }

    if (in3 && isMSItem3End(node, $, direct)) {
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
if (process.argv[1].includes("MS_10Q_parse_item3.js")) {
  const html = fs.readFileSync("edgar_raw_html/MS_10-Q_2025-08-01.html","utf8");
  const out = parseItem3(html);
  fs.writeFileSync("edgar_parsed_json/MS_10-Q_2025-08-01_item3.json", JSON.stringify(out,null,2));
  console.log("Saved MS_10K_item3.json");
}
*/