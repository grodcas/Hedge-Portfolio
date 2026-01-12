import fs from "fs";
import * as cheerio from "cheerio";
import qp from "quoted-printable";
import iconv from "iconv-lite";

async function scrapeAAII() {
  const raw = fs.readFileSync("Sentiment Survey Past Results _ AAII.mhtml", "utf8");

  // 1) Find the HTML MIME part
  const htmlIdx = raw.indexOf("Content-Type: text/html");
  if (htmlIdx === -1) {
    console.error("HTML section not found");
    return [];
  }

  // 2) Find the end of MIME headers: match both \r\n\r\n and \n\n
  const headerEndMatch = raw.slice(htmlIdx).match(/(\r?\n\r?\n)/);
  if (!headerEndMatch) {
    console.error("HTML body not found");
    return [];
  }

  const headerEndOffset = htmlIdx + headerEndMatch.index + headerEndMatch[0].length;

  // 3) This is the quoted-printable encoded HTML body
  const qpBody = raw.slice(headerEndOffset);

  // 4) Decode it properly
  const decodedHtml = iconv.decode(qp.decode(qpBody), "utf8");

  // 5) Parse with cheerio
  const $ = cheerio.load(decodedHtml);
  const rows = [];

  $("table.bordered tr").each((i, el) => {
    if (i === 0) return; // skip header

    const cols = $(el).find("td");
    if (cols.length !== 4) return;

    rows.push({
      date: $(cols[0]).text().trim(),
      bullish: parseFloat($(cols[1]).text().replace("%", "")),
      neutral: parseFloat($(cols[2]).text().replace("%", "")),
      bearish: parseFloat($(cols[3]).text().replace("%", ""))
    });
  });

  return rows.slice(0, 3);
}



export { scrapeAAII };
scrapeAAII().then(console.log)
