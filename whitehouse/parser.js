import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function scrapeWhiteHouseArticle(url) {
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const content = $(".wp-block-post-content");

  let text = "";

  content.find("p, li").each((i, el) => {
    const t = $(el).text().trim();
    if (t) text += t + "\n";
  });

  return text.trim();
}
