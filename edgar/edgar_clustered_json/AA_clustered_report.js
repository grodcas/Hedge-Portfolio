import fs from "fs";
import path from "path";

const DIR = process.cwd();

// --------------------
// failure heuristics
// --------------------
function isFailedClusterFile(json) {
  if (!json) return true;
  if (Object.keys(json).length === 0) return true;

  // case: { clusters: [] }
  if (Array.isArray(json.clusters) && json.clusters.length === 0) return true;

  return false;
}

function isFailedCluster(cluster) {
  if (!cluster) return true;
  if (typeof cluster !== "object") return true;

  // missing content
  if (!cluster.content) return true;

  // content exists but empty or meaningless
  if (typeof cluster.content === "string") {
    const cleaned = cluster.content.replace(/\s+/g, "");
    if (cleaned.length === 0) return true;
  }

  return false;
}

// --------------------
// main
// --------------------
const files = fs.readdirSync(DIR).filter(f => f.endsWith("_clustered.json"));

const perTicker = {};
let totalClusters = 0;

for (const file of files) {
  const fullPath = path.join(DIR, file);
  const raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));

  const ticker = file.split("_")[0];
  if (!perTicker[ticker]) {
    perTicker[ticker] = {
      files: 0,
      clusters: 0,
      failedClusters: []
    };
  }

  perTicker[ticker].files++;

  // whole file failed
  if (isFailedClusterFile(raw)) {
    perTicker[ticker].failedClusters.push(`${file} (entire file)`);
    continue;
  }

  // handle different shapes
  const clusterArrays = [];

  if (Array.isArray(raw)) {
    clusterArrays.push({ name: "root", arr: raw });
  } else {
    for (const [key, val] of Object.entries(raw)) {
      if (Array.isArray(val)) {
        clusterArrays.push({ name: key, arr: val });
      }
    }
  }

  for (const { name, arr } of clusterArrays) {
    for (let i = 0; i < arr.length; i++) {
      totalClusters++;
      perTicker[ticker].clusters++;

      if (isFailedCluster(arr[i])) {
        perTicker[ticker].failedClusters.push(
          `${file} → ${name}[${i + 1}]`
        );
      }
    }
  }
}

// --------------------
// reporting
// --------------------
console.log("\n=== EDGAR CLUSTER AUDIT ===\n");

for (const [ticker, info] of Object.entries(perTicker)) {
  console.log(`Ticker: ${ticker}`);
  console.log(`  Files: ${info.files}`);
  console.log(`  Clusters: ${info.clusters}`);
  console.log(`  Failed: ${info.failedClusters.length}`);

  if (info.failedClusters.length > 0) {
    for (const f of info.failedClusters) {
      console.log(`    ❌ ${f}`);
    }
  }
  console.log("");
}

console.log(`TOTAL CLUSTERS: ${totalClusters}`);
console.log("DONE.");
