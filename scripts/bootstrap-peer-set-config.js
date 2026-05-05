// scripts/bootstrap-peer-set-config.js
//
// One-shot loader for PEER_SET_config (D1). Reads config/peers-mapping.json
// and POSTs the whole payload to portfolio-ingestor's /ingest/peer-set-config
// endpoint, which upserts one row per ticker.
//
// Re-run after editing config/peers-mapping.json (e.g., portfolio composition
// changes) or after running scripts/bootstrap-peers.js.
//
// Run: `node scripts/bootstrap-peer-set-config.js` from repo root.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const INGESTOR_URL = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";
const MAPPING_PATH = path.join(ROOT, "config/peers-mapping.json");

async function main() {
  if (!fs.existsSync(MAPPING_PATH)) {
    throw new Error(`peers-mapping.json not found at ${MAPPING_PATH}`);
  }
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));
  const tickers = Object.keys(mapping);
  console.log(`[peer-set-config] read ${tickers.length} tickers from peers-mapping.json`);

  // Pass through `{ ticker: { ..., peers: [...] }, ... }`. The ingestor pulls
  // peers off each entry; sector/industry are intentionally not stored on
  // PEER_SET_config (the table has no columns for them and they'd duplicate
  // FUND_01_Fundamentals.sector / industry anyway).
  const payload = { ...mapping, __source: "finnhub" };

  const res = await fetch(`${INGESTOR_URL}/ingest/peer-set-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ingest failed: HTTP ${res.status} — ${text}`);
  }
  console.log(`[peer-set-config] ${res.status} ${text}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
