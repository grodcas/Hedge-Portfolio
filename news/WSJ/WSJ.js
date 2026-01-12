import fs from "fs";
import { load } from "cheerio";
import qp from "quoted-printable";
import iconv from "iconv-lite";

function parseWSJ(path) {
  // WSJ HTML also uses =3D etc. → decode first
  const raw = fs.readFileSync(path, "utf8");
  const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(decoded);

  // Headline: WSJ stores multiple meta variants
  const headline =
    $('meta[name="article.headline"]').attr("content") ||
    $('meta[name="article.origheadline"]').attr("content") ||
    $("h1").first().text().trim();

  // Extract all WSJ article paragraphs
  let paragraphs = [];
  $('p[data-type="paragraph"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length) paragraphs.push(t);
  });

  return {
    headline,
    text: paragraphs.join("\n\n"),
  };
}

// ---- RUN ----
const { headline, text } = parseWSJ("WSJ.mhtml");

console.log("HEADLINE:\n" + headline);
console.log("\nTEXT:\n" + text);
