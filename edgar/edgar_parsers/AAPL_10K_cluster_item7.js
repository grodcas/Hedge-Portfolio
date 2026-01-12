import fs from "fs";

// ---------- helpers ----------
function wordCount(str) {
  return str.split(/\s+/).filter(Boolean).length;
}

function charCount(blocks) {
  return blocks
    .map(b => b.type === "text" ? b.text.length : JSON.stringify(b).length)
    .reduce((a,b) => a+b, 0);
}

function firstWords(text, n = 10) {
  return text.split(/\s+/).slice(0, n).join(" ");
}

// ---------- main clustering ----------
export function clusterItem7(parsed, minWords = 150, MAX_CHARS = 8000) {
  const blocks = parsed.item7;
  const clusters = [];
  let current = null;

  // ------- FIRST PASS: TITLE-GROUPING -------
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (b.type === "title") {

      // if previous cluster exists, push it
      if (current && current.blocks.length > 0) {
        clusters.push(current);
      }

      // skip duplicate titles (title followed by title)
      const next = blocks[i + 1];
      if (next && next.type === "title") continue;

      current = {
        title: b.text,
        blocks: [{ ...b }]
      };

      continue;
    }

    if (current) {
      current.blocks.push({ ...b });
    }
  }

  if (current && current.blocks.length) {
    clusters.push(current);
  }

  // ------- SECOND PASS: MERGE SMALL CLUSTERS -------
  const merged = [];
  let acc = null;

  for (const c of clusters) {
    const textContent = c.blocks
      .filter(x => x.type === "text")
      .map(x => x.text)
      .join(" ");

    if (!acc) {
      acc = c;
      continue;
    }

    if (wordCount(textContent) < minWords) {
      // merge into acc
      acc.blocks.push(...c.blocks);
      acc.title ||= c.title;
    } else {
      merged.push(acc);
      acc = c;
    }
  }
  if (acc) merged.push(acc);

  // ------- THIRD PASS: SPLIT BY MAX_CHARS & BY TITLES -------
  const finalClusters = [];

  for (const c of merged) {
    const totalChars = charCount(c.blocks);

    if (totalChars <= MAX_CHARS) {
      finalClusters.push(c);
      continue;
    }

    // too big → split by internal titles
    let sub = null;

    for (const b of c.blocks) {
      if (b.type === "title") {
        if (sub && sub.blocks.length > 0) {
          finalClusters.push(sub);
        }
        sub = { title: b.text, blocks: [b] };
      } else if (sub) {
        sub.blocks.push(b);
      }
    }

    if (sub && sub.blocks.length > 0) {
      finalClusters.push(sub);
    }
  }

  // ------- FOURTH PASS: DESCRIPTION CREATION -------
  const output = finalClusters.map(c => {
    const titlesInside = c.blocks.filter(b => b.type === "title");

    const titleSummaries = titlesInside.map(t => {
      const idx = c.blocks.indexOf(t);
      let nextText = "";

      // find first text block after this title
      for (let j = idx + 1; j < c.blocks.length; j++) {
        if (c.blocks[j].type === "text") {
          nextText = firstWords(c.blocks[j].text, 10);
          break;
        }
      }

      return `${t.text} – ${nextText}`;
    });

    const hasTable = c.blocks.some(x => x.type === "table");

    return {
      title: c.title,
      description: titleSummaries.join(" | "),
      has_table: hasTable,
      blocks: c.blocks
    };
  });

  return output;
}


// ---------- CLI ----------
if (process.argv[1].includes("cluster_item7.js")) {
  const parsed = JSON.parse(fs.readFileSync("AAPL_10K_item7.json", "utf8"));
  const clusters = clusterItem7(parsed);
  fs.writeFileSync("AAPL_10K_item7_clusters.json", JSON.stringify(clusters, null, 2));
  console.log("Saved AAPL_10K_item7_clusters.json");
}
