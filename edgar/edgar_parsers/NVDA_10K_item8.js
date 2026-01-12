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

function isAuditorLeadIn(text) {
  return clean(text).startsWith(
    "We have served as the Company’s auditor since"
  );
}


// Detect bold-span titles (same logic as item 7)
function isTitleSpan(node, $) {
  const bold = $(node).find(
    "span[style*='font-weight:700'], span[style*='font-weight:bold'], strong"
  );
  if (bold.length === 0) return false;

  const text = clean($(node).text());
  if (!text || text.length > 140) return false;



  return true;
}

function isItem15Title(node, $) {
  const bold = $(node).find(
    "span[style*='font-weight:700'], span[style*='font-weight:bold'], strong"
  );
  if (!bold.length) return false;

  const t = clean(bold.text()).toUpperCase();
  return t.startsWith("ITEM 15.");
}


// Detect Item 8 boundaries

function isNVDANotesStart(node, $) {
  const text = clean($(node).text());

  // exact ALL-CAPS notes title
  if (
    text === "NOTES TO THE CONSOLIDATED FINANCIAL STATEMENTS"
  ) return true;

  // safety: first Note header
  if (/^Note\s+1\b/i.test(text)) return true;

  // safety: first subsection always starts with this
  if (text === "Our Company") return true;

  return false;
}


// Hard stop when hitting notes section
function isNotesSection(text) {
  const raw = clean(text);
  return (
    raw === raw.toUpperCase() &&
    raw.includes("NOTES TO THE CONSOLIDATED FINANCIAL STATEMENTS")
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

  let in15 = false;
  const blocks = [];
  let stop = false;

  walk(root, (node) => {
    if (!node.tagName || stop) return;

    const tag = node.tagName.toLowerCase();
    const text = clean($(node).text());

    if (in15 && isAuditorLeadIn(text)) {
      blocks.length = 0;   // drop everything collected so far
      return;
    }

    // Detect Item 8 start/end
    // Detect Item 15 start
    if (isItem15Title(node, $)) {
      in15 = true;
      return;
    }
    if (!in15) return;


    // Early stop: Notes section
    if (isNotesSection(text)) {
      stop = true;
      return;
    }
    if (in15 && isNVDANotesStart(node, $)) {
      stop = true;
      return;
    }


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
    if (IS_TEXT && text.length > 30) {
      blocks.push({
        type: "text",
        text
      });
    }
  });

  return { item8: blocks };
}
/*
// CLI usage
if (process.argv[1].includes("NVDA_10K_parse_item8.js")) {
  const html = fs.readFileSync("edgar_raw_html/NVDA_10-K_2023-11-03.html", "utf8");
  const out = parseItem8(html);
  fs.writeFileSync("edgar_parsed_json/NVDA_10-K_2023-11-03_item8.json", JSON.stringify(out, null, 2));
  console.log("NVDA_10-K_2023-11-03_item8.json");
}
*/