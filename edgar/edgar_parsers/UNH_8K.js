// parse_8k_linear.js
import { load } from "cheerio";
import he from "he";

// ---- Clean helper ----
function clean(t) {
  return he.decode(t || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// ---- Extract all visible text ----
function extractAllText(html) {
  const $ = load(html, { decodeEntities: false });
  const chunks = [];

  $("body *").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;
    if (["script", "style"].includes(tag)) return;

    const text = clean($(el).text());
    if (text.length > 20) chunks.push(text);
  });

  return chunks.join("\n");
}

// ---- Slice between first Item and Signature(s) ----
function slice8KBody(text) {
  const start = text.search(/item/i);
  if (start === -1) return "";

  const end = text.search(/signatures?/i);
  if (end === -1) return text.slice(start);

  return text.slice(start, end);
}

// ---- Split into items (very light) ----
function splitItems(text) {
  const parts = text.split(/(?=Item\s*\d+\.\d+)/i);

  return parts
    .map(p => {
      const m = p.match(/Item\s*(\d+\.\d+)/i);
      if (!m) return null;

      return {
        item: m[1],
        text: clean(p)
      };
    })
    .filter(Boolean);
}

// ---- Main ----
export function parse8K(html) {
  const allText = extractAllText(html);
  const mainBody = slice8KBody(allText);
  return splitItems(mainBody);
}

// CLI
/*
if (process.argv[1].includes("UNH_8K_parse.js")) {
  const html = fs.readFileSync("edgar_raw_html/UNH_8-K_2025-10-30.html","utf8");
  const out = parse8K(html);
  fs.writeFileSync("edgar_parsed_json/UNH_8-K_2025-10-30_parsed.json", JSON.stringify(out, null, 2));
  console.log("Saved UNH_8-K_2025-10-30_parsed.json");
}
*/