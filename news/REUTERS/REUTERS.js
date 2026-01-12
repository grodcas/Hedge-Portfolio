import fs from "fs";
import { load } from "cheerio";
import qp from "quoted-printable";
import iconv from "iconv-lite";

function parseReuters(path) {
  // decode =3D etc.
  const raw = fs.readFileSync(path, "utf8");
  const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(decoded);

  // Headline
  const headline =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text().trim();

  // Real article text paragraphs
  let paragraphs = [];

  $('div[data-testid^="paragraph-"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0) paragraphs.push(t);
  });

  return {
    headline,
    text: paragraphs.join("\n\n")
  };
}

// ---- RUN ----
const { headline, text } = parseReuters("ROUTERS.mhtml");

console.log("HEADLINE:\n" + headline);
console.log("\nTEXT:\n" + text);
