import fs from "fs";
import { load } from "cheerio";
import qp from "quoted-printable";
import iconv from "iconv-lite";

function parseReuters(path) {
  // decode =3D etc.
  const raw = fs.readFileSync(path, "utf8");
  //const decoded = iconv.decode(qp.decode(raw), "utf8");

  const $ = load(raw);

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

import readline from "readline";
import path from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const waitForEnter = () => new Promise((resolve) => {
  rl.question("\nPress Enter to continue to next file...", resolve);
});

async function main() {
  const filesDir = "files";
  const files = fs.readdirSync(filesDir).filter((f) => f.endsWith(".htm") || f.endsWith(".html"));

  console.log(`Found ${files.length} files to process.\n`);

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(filesDir, files[i]);
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[${i + 1}/${files.length}] FILE: ${files[i]}`);
    console.log("=".repeat(80));

    const { headline, text } = parseReuters(filePath);

    console.log("\nHEADLINE:\n" + headline);
    console.log("\nTEXT:\n" + text);

    if (i < files.length - 1) {
      await waitForEnter();
    }
  }

  console.log("\n✓ All files processed.");
  rl.close();
}

main();

