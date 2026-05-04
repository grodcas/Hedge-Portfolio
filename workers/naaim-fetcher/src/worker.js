/**
 * DEPRECATED 2026-05-04: no free numeric source for the NAAIM Exposure Index.
 *
 * Sources surveyed before drop:
 *   - https://www.naaim.org/wp-content/uploads/CSV-of-NAAIM-Exposure-Index.csv
 *     (canonical CSV) — the URL moves between subpaths every few months, so
 *     it can't be relied on as a stable cron target.
 *   - https://www.naaim.org/programs/naaim-exposure-index/ (HTML page) —
 *     value is rendered by JS; the raw HTML carries no number.
 *   - https://www.naaim.org/feed/ (RSS) — only carries "NAAIM Speaks"
 *     newsletter post titles; no exposure index numbers (verified
 *     2026-05-04 during the pipeline-leftovers sprint).
 *
 * Cron disabled in wrangler.jsonc. /build now returns a deprecation notice
 * without touching D1. Worker body kept for history; if a free numeric
 * source resurfaces, restore the cron + remove this header.
 */

const CSV_URL = "https://www.naaim.org/wp-content/uploads/CSV-of-NAAIM-Exposure-Index.csv";
const PAGE_URL = "https://www.naaim.org/programs/naaim-exposure-index/";

export default {
  async fetch(req, _env) {
    const url = new URL(req.url);
    if (url.pathname === "/build" || url.pathname === "/status") {
      return Response.json({
        ok: false,
        deprecated: true,
        reason: "NAAIM Exposure Index has no free numeric source — see worker.js header",
      });
    }
    return new Response("Not found", { status: 404 });
  },
  // No scheduled handler — cron is disabled in wrangler.jsonc.
};

// ----- legacy implementation kept below for history (no longer reachable) -----

// eslint-disable-next-line no-unused-vars
async function build(env) {
  // Try CSV first — most stable, machine-readable.
  let rows = [];
  let sourceUsed = null;
  try {
    rows = await fetchNAAIMCsv();
    if (rows.length > 0) sourceUsed = "csv";
  } catch (err) {
    console.warn(`[naaim] CSV path failed: ${err.message} — falling back to page scrape`);
  }
  if (rows.length === 0) {
    try {
      rows = await fetchNAAIMPage();
      if (rows.length > 0) sourceUsed = "page";
    } catch (err) {
      console.error(`[naaim] page path failed: ${err.message}`);
    }
  }
  if (rows.length === 0) {
    return { ok: false, reason: "no rows from CSV or page scrape; manual investigation needed" };
  }

  // rows are chronological; keep the last 8 weeks for the rolling window.
  const recent = rows.slice(-8);
  let inserted = 0;
  let prior = recent.length > 1 ? recent[recent.length - 2].value : null;

  for (let i = 0; i < recent.length; i++) {
    const r = recent[i];
    const priorValue = i > 0 ? recent[i - 1].value : null;
    await env.DB.prepare(
      `INSERT INTO MACRO_STATE_indicators
         (id, release_date, period, indicator_code, indicator_name, value, prior, unit, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         release_date   = excluded.release_date,
         period         = excluded.period,
         indicator_name = excluded.indicator_name,
         value          = excluded.value,
         prior          = excluded.prior,
         unit           = excluded.unit,
         source         = excluded.source`,
    )
      .bind(
        await shortHash(`NAAIM|NAAIM|${r.date}`),
        r.date,
        r.date,
        "NAAIM",
        "NAAIM Exposure Index",
        r.value,
        priorValue,
        "index",
        "NAAIM",
      )
      .run();
    inserted++;
  }

  return {
    ok: true,
    source_used: sourceUsed,
    latest: recent[recent.length - 1],
    prior,
    inserted,
  };
}

async function status(env) {
  const latest = await env.DB.prepare(
    `SELECT release_date, value, prior
       FROM MACRO_STATE_indicators
      WHERE indicator_code = 'NAAIM'
      ORDER BY release_date DESC
      LIMIT 1`,
  ).first();
  return { ok: true, latest };
}

// ---------- CSV path ----------
// Expected schema (NAAIM-published): header row, then `Date,Mean,Q1,Q2,Q3,Bullish,Bearish,Number Responses`
// We only persist Mean. NAAIM typically uses M/D/YYYY in their CSV.
async function fetchNAAIMCsv() {
  const res = await fetch(CSV_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HF-pipeline/1.0)" },
  });
  if (!res.ok) throw new Error(`NAAIM CSV → HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 2) continue;
    const date = parseUSDate(cols[0].trim());
    const value = parseFloat(cols[1]);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  // Sort chronological in case CSV has any oddness.
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

// ---------- HTML page fallback ----------
// Parses only the most recent value off the public exposure-index page.
async function fetchNAAIMPage() {
  const res = await fetch(PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HF-pipeline/1.0)" },
  });
  if (!res.ok) throw new Error(`NAAIM page → HTTP ${res.status}`);
  const html = await res.text();

  // Two common shapes seen on the page:
  //   "Mean Average: <span>67.45</span>"
  //   "Latest data point: 67.45 (12/04/2024)"
  // Try a permissive regex that pulls a date-value pair near the words "Mean" or "Average".
  const re = /(?:Mean[^0-9]{0,40}|Average[^0-9]{0,40})([0-9]+(?:\.[0-9]+)?)[\s\S]{0,200}?(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i;
  const m = html.match(re);
  if (!m) return [];
  const value = parseFloat(m[1]);
  const date  = m[2].includes("/") ? parseUSDate(m[2]) : m[2];
  if (!Number.isFinite(value) || !date) return [];
  return [{ date, value }];
}

function parseUSDate(s) {
  // Accept MM/DD/YYYY or M/D/YYYY (with 2- or 4-digit year).
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = m[1].padStart(2, "0");
  const day   = m[2].padStart(2, "0");
  const yearRaw = m[3];
  const year  = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${month}-${day}`;
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
