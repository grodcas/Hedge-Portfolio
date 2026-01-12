// parse_item8.js
import fs from "fs";
// CVX_10K_item8.js
import { load } from "cheerio";
import he from "he";

/* ---------------- helpers ---------------- */

function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// IMPORTANT: direct-node text only
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

/* ---------------- boundaries ---------------- */

// Start: auditor paragraph
function isCVXItem8Start(text) {
  return text.includes("We have served as the Company’s auditor since 1935.");
}

// End: first Note 1 + Summary of Significant Accounting Policies
function isCVXItem8End(node, $, text) {
  if (text !== "Note 1") return false;

  // must be a span
  if (node.tagName.toLowerCase() !== "span") return false;

  const style = ($(node).attr("style") || "").toLowerCase();

  return (
    style.includes("color:#0077c0") &&
    style.includes("font-size:12pt") &&
    style.includes("font-weight:700")
  );
}


/* ---------------- DOM walk ---------------- */

function walk(node, cb) {
  cb(node);
  node.children?.forEach(child => walk(child, cb));
}

/* ---------------- parser ---------------- */

export function parseItem8(html) {
  const $ = load(html, { decodeEntities: false });
  const root = $("body").length ? $("body")[0] : $.root()[0];

  let in8 = false;
  let stop = false;
  const blocks = [];

  walk(root, (node) => {
    if (!node.tagName || stop) return;

    const tag = node.tagName.toLowerCase();
    const text = directText(node, $);
    const fullText = clean($(node).text());

    // START
    if (!in8 && isCVXItem8Start(text)) {
      in8 = true;
      return;
    }

    // END
    if (in8 && isCVXItem8End(node, $, text)) {
      stop = true;
      return;
    }

    if (!in8) return;

    // ---- TABLES ONLY ----
    if (tag === "table") {
      const rows = [];
      $(node).find("tr").each((_, tr) => {
        const cells = [];
        $(tr).find("th,td").each((__, td) => {
          cells.push(clean($(td).text()));
        });
        if (cells.some(Boolean)) rows.push(cells);
      });
      if (rows.length) {
        blocks.push({ type: "table", rows });
      }
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

  return { item8: blocks };
}

/*
// CLI usage
if (process.argv[1].includes("CVX_10K_parse_item8.js")) {
  const html = fs.readFileSync("edgar_raw_html/CVX_10-K_2023-11-03.html", "utf8");
  const out = parseItem8(html);
  fs.writeFileSync("edgar_parsed_json/CVX_10-K_2023-11-03_item8.json", JSON.stringify(out, null, 2));
  console.log("CVX_10-K_2023-11-03_item8.json");
}
*/