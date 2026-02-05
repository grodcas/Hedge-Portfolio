import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2] || "C:/AI_agent/HF/edgar/edgar_clustered_json";
const WORKER_INGEST_URL = process.env.INGEST_URL; // e.g. https://edgar-ingestor.yourname.workers.dev/ingest

if (!WORKER_INGEST_URL) {
  console.error("Set INGEST_URL env var to your Worker /ingest endpoint.");
  process.exit(1);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}


const reportCounter = new Map();


function parseFilename(filename) {
  const base = filename.replace(/\.json$/i, "");
  const noSuffix = base.replace(/_clustered$/i, "");

  const parts = noSuffix.split("_");
  if (parts.length < 3) throw new Error(`Bad filename: ${filename}`);

  const ticker = parts[0];
  const reportDate = parts[parts.length - 1];
  const reportType = parts.slice(1, -1).join("_"); // handles 8-K, 10-Q, etc.

  return { ticker, reportType, reportDate };
}

function extract8kItemKeyFromContent(content) {
  // Look for "Item 5.02" etc anywhere in content
  const m = content.match(/\bItem\s+([0-9]+(?:\.[0-9]+)?[A-Za-z]?)\b/i);
  if (!m) return "ITEM_UNKNOWN";
  return `ITEM_${m[1].toUpperCase()}`;
}

function normalizeToItems(json, reportType) {
  // Returns: [{ itemKey, clusters:[{clusterIndex, content}] }]
  // 10-Q/10-K format: object with item1/item2...
  if (json && !Array.isArray(json) && typeof json === "object") {
    const items = [];
    for (const [k, arr] of Object.entries(json)) {
      if (!Array.isArray(arr)) continue;
      const num = (k.match(/item\s*([0-9]+[A-Za-z]?)$/i) || [])[1];
      const itemKey = num ? `ITEM_${num.toUpperCase()}` : k.toUpperCase();

      items.push({
        itemKey,
        clusters: arr
          .filter(x => x && Number.isFinite(x.cluster) && typeof x.content === "string")
          .map(x => ({ clusterIndex: x.cluster, content: x.content })),
      });
    }
    return items;
  }

  // 8-K / Form 4 format: array of clusters; each cluster may belong to a different Item (e.g., Item 5.02)
  if (Array.isArray(json)) {
    const byItem = new Map();
    for (const x of json) {
      if (!x || !Number.isFinite(x.cluster) || typeof x.content !== "string") continue;
      const itemKey = extract8kItemKeyFromContent(x.content);
      if (!byItem.has(itemKey)) byItem.set(itemKey, []);
      byItem.get(itemKey).push({ clusterIndex: x.cluster, content: x.content });
    }
    return [...byItem.entries()].map(([itemKey, clusters]) => ({ itemKey, clusters }));
  }

  return [];
}

async function postPayload(payload) {
  const res = await fetch(WORKER_INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Ingest failed ${res.status}: ${txt}`);
  }
  return res.json();
}

const MAX_CLUSTERS = 50;


async function main() {

  const today = todayISO();
  const yesterday = yesterdayISO();

  const files = fs.readdirSync(DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        return { file: f, ...parseFilename(f) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);


  // ---- 10-Q / 10-K: keep latest 4 per ticker ----
  const longReports = files
    .filter(f => (f.reportType === "10-Q" || f.reportType === "10-K")
     && (f.reportDate === today || f.reportDate === yesterday)
    //&& f.reportDate >= "2026-01-17"
    );

    /*

    .sort((a, b) => b.reportDate.localeCompare(a.reportDate));


    
  const latestLongReports = new Map(); // ticker → files[]

  for (const f of longReports) {
    if (!latestLongReports.has(f.ticker)) {
      latestLongReports.set(f.ticker, []);
    }
    const arr = latestLongReports.get(f.ticker);
    if (arr.length < 4) arr.push(f);
  }
    */

  // ---- 8-K / FORM 4: today or yesterday ----
  const shortReports = files.filter(f =>
    (f.reportType === "8-K" || f.reportType === "FORM4" || f.reportType === "Form4") &&
    (f.reportDate === today || f.reportDate === yesterday)
  );

  const filesToIngest = [
    //...[...latestLongReports.values()].flat(),
    ...longReports,
    ...shortReports
  ];

  //.filter(f => f.includes("_4_")); // ONLY Form 4


  console.log(`Found ${filesToIngest.length} json files in ${DIR}`);

  for (const f of filesToIngest) {
    const full = path.join(DIR, f.file);
    const raw = fs.readFileSync(full, "utf8");

    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      console.error(`Skip (bad JSON): ${f}`);
      continue;
    }

    const { ticker, reportType, reportDate } = f;
    const key = `${ticker}|${reportType}|${reportDate}`;
    const seq = (reportCounter.get(key) ?? 0) + 1;
    reportCounter.set(key, seq);

    const items = normalizeToItems(json, reportType);
    for (const it of items) {
      const chunks = chunkArray(it.clusters, MAX_CLUSTERS);

      for (let i = 0; i < chunks.length; i++) {
        const payload = {
          ticker,
          reportType,
          reportDate,
          report_seq: seq,
          itemKey: it.itemKey,
          clusters: chunks[i],
          chunkIndex: i,
          totalChunks: chunks.length
        };


        try {
          await postPayload(payload);
          console.log(
             `OK: ${f.ticker} ${f.reportType} ${f.reportDate} ${it.itemKey} chunk ${i + 1}/${chunks.length}`
          );
        } catch (e) {
          console.error(
            `FAIL: ${f} ${it.itemKey} chunk ${i + 1}:`,
            e.message
          );
          return; // stop on first failure (important)
        }
      }
    }

  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
