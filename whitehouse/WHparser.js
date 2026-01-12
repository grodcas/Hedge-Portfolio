import fetch from "node-fetch";
import * as cheerio from "cheerio";

async function scrapeWhiteHouseNews() {
  const url = "https://www.whitehouse.gov/news/";
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const results = [];

  $("li.wp-block-post").each((i, el) => {
    // Title + link
    const a = $(el).find("h2.wp-block-post-title a");
    const title = a.text().trim();
    const link = a.attr("href");

    // Date (normalized)
    const timeEl = $(el).find(".wp-block-post-date time");
    const datetime = timeEl.attr("datetime")?.trim() || null;

    let date = null;
    if (datetime) {
      date = datetime.split("T")[0];    // "2025-11-14T16:53..." → "2025-11-14"
    }

    if (title && link) {
      results.push({
        title,
        link,
        date
      });
    }
  });

  return results;
}

// Example run
scrapeWhiteHouseNews().then(console.log);
