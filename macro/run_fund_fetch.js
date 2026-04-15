// One-shot runner: invokes fetchFundamentals to backfill FUND_01 for missing tickers.
import "dotenv/config";
import { fetchFundamentals } from "../src/steps/fetch-fundamentals.js";

const logger = {
  log: (tag, msg, level = "info") => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] [${tag}] ${level !== "info" ? `(${level}) ` : ""}${msg}`);
  },
};

const config = {};
const results = {};

try {
  const r = await fetchFundamentals(config, logger, results);
  console.log(`\n[done] fetched=${r.fetched ?? (r.data?.length || 0)} errors=${r.errors?.length || 0}`);
  process.exit(0);
} catch (err) {
  console.error(`[fail] ${err.message}`);
  process.exit(1);
}
