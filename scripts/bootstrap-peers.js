// scripts/bootstrap-peers.js
//
// One-shot peer-mapping bootstrap. Calls Finnhub /stock/peers + /stock/profile2
// once per portfolio ticker and writes config/peers-mapping.json.
//
// Re-run when portfolio composition changes (not daily). Finnhub free tier
// allows 60 req/min, so 50 calls (2 endpoints × 25 tickers) finishes in ~50s
// with the built-in throttle.
//
// Finnhub is chosen over FMP because FMP /v4/stock_peers and /v3/profile
// require a paid plan (the repo's current FMP_KEY is free-tier and returns 403).
//
// Run: `node scripts/bootstrap-peers.js` from repo root. Requires FINNHUB_KEY in .env.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

const TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "GS", "BAC", "XOM", "CVX", "UNH", "LLY", "JNJ",
  "PG", "KO", "HD", "CAT", "BA", "INTC", "AMD", "NFLX", "MS",
];

// Finnhub uses BRK.B as-is (Finnhub handles the dot).
const fhSymbol = (t) => t;

async function fetchPeers(ticker, apiKey) {
  const url = `https://finnhub.io/api/v1/stock/peers?symbol=${fhSymbol(ticker)}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub peers HTTP ${res.status} for ${ticker}`);
  const data = await res.json();
  // Returns an array of symbols; the first element is the queried ticker itself — filter it out.
  const list = Array.isArray(data) ? data : [];
  return list.filter((s) => s !== ticker);
}

async function fetchProfile(ticker, apiKey) {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${fhSymbol(ticker)}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub profile HTTP ${res.status} for ${ticker}`);
  const data = await res.json();
  return {
    sector: data?.finnhubIndustry || null,
    industry: data?.finnhubIndustry || null,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const apiKey = process.env.FINNHUB_KEY;
  if (!apiKey) {
    console.error("FINNHUB_KEY not set in .env — aborting");
    process.exit(1);
  }

  const out = {};
  let ok = 0;
  let fail = 0;

  for (const ticker of TICKERS) {
    try {
      const [peers, profile] = await Promise.all([
        fetchPeers(ticker, apiKey),
        fetchProfile(ticker, apiKey),
      ]);
      out[ticker] = {
        sector: profile.sector,
        industry: profile.industry,
        peers,
      };
      ok++;
      console.log(`[${ok + fail}/${TICKERS.length}] ${ticker}: sector=${profile.sector}, ${peers.length} peers`);
    } catch (err) {
      fail++;
      console.error(`[${ok + fail}/${TICKERS.length}] ${ticker}: ${err.message}`);
      out[ticker] = { sector: null, industry: null, peers: [], error: err.message };
    }
    // Throttle to stay well under 300 req/min even on bursts
    await sleep(300);
  }

  const configDir = path.join(ROOT, "config");
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  const outPath = path.join(configDir, "peers-mapping.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\nWrote ${outPath}`);
  console.log(`OK: ${ok}, failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
