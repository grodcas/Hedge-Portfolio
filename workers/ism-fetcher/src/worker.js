/**
 * DEPRECATED 2026-05-04: ISM World walls all PMI report URLs behind Google
 * reCAPTCHA. Server-side scrapes return a captcha-form HTML stub instead of
 * the report — no JS-execution-free path to the PMI value.
 *
 * Paths surveyed before drop:
 *   - https://www.ismworld.org/supply-management-news-and-reports/reports/
 *     ism-report-on-business/pmi/  (legacy URL, originally tried) — 404.
 *   - https://www.ismworld.org/supply-management-news-and-reports/reports/
 *     ism-pmi-reports                                              — 200 but
 *     served captcha-form stub (verified 2026-05-04 during the
 *     pipeline-leftovers sprint).
 *   - https://www.ismworld.org/news-and-publications/reports/      — 404.
 *
 * FRED dropped the ISM PMI series in 2017 after ISM revoked syndication, so
 * there's no FRED fallback either. Both ISM_MFG and ISM_SVC are dropped per
 * soft-delete protocol (worker body kept for history).
 *
 * Cron disabled in wrangler.jsonc. /build returns a deprecation notice.
 */

const REPORT_PAGES = [
  {
    url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/pmi/",
    code: "ISM_MFG",
    name: "ISM Manufacturing PMI",
  },
  {
    url: "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/services/",
    code: "ISM_SVC",
    name: "ISM Services PMI",
  },
];

export default {
  async fetch(req, _env) {
    const url = new URL(req.url);
    if (url.pathname === "/build" || url.pathname === "/status") {
      return Response.json({
        ok: false,
        deprecated: true,
        reason: "ISM PMI pages are reCAPTCHA-walled and FRED dropped the series — see worker.js header",
      });
    }
    return new Response("Not found", { status: 404 });
  },
  // No scheduled handler — cron is disabled in wrangler.jsonc.
};

// ----- legacy implementation kept below for history (no longer reachable) -----

// eslint-disable-next-line no-unused-vars
async function build(env) {
  const out = { ok: true, attempts: [] };

  for (const target of REPORT_PAGES) {
    const attempt = { code: target.code, status: "pending" };
    out.attempts.push(attempt);

    // Idempotency: skip if this month's value already in the DB.
    const period = currentPeriod();
    const existing = await env.DB.prepare(
      `SELECT 1 FROM MACRO_STATE_indicators
        WHERE indicator_code = ? AND period = ?
        LIMIT 1`,
    ).bind(target.code, period).first();
    if (existing) {
      attempt.status = "skip";
      attempt.reason = "current month already ingested";
      continue;
    }

    let parsed;
    try {
      parsed = await scrapeISM(target.url);
    } catch (err) {
      attempt.status = "fail";
      attempt.reason = err.message;
      console.error(`[ism] ${target.code} scrape failed: ${err.message}`);
      continue;
    }
    if (!parsed) {
      attempt.status = "fail";
      attempt.reason = "page parsed but no value found";
      continue;
    }

    // ISM publishes "for {Month} {Year}" → period code matches.
    const periodCode = parsed.period || period;
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
        await shortHash(`ISM|${target.code}|${periodCode}`),
        parsed.releaseDate || todayStr(),
        periodCode,
        target.code,
        target.name,
        parsed.value,
        parsed.prior || null,
        "index",
        "ISM",
      )
      .run();

    attempt.status = "ok";
    attempt.value = parsed.value;
    attempt.period = periodCode;
  }

  return out;
}

async function status(env) {
  const rows = await env.DB.prepare(
    `SELECT release_date, period, indicator_code, value, prior
       FROM MACRO_STATE_indicators
      WHERE indicator_code IN ('ISM_MFG', 'ISM_SVC')
      ORDER BY release_date DESC
      LIMIT 12`,
  ).all();
  return { ok: true, latest: rows.results || [] };
}

// ---------- ISM page scrape ----------
// ISM's PMI page typically shows the headline value in a hero block:
//   "{Month} {Year} Manufacturing ISM® Report On Business®"
//   "PMI® at 49.8" / "PMI® registered 49.8 percent"
//   "from 50.2 in {Month} {Year}"  (prior month)
// The regex is permissive — if the page restyles, we log + skip rather than
// guess at a number.
async function scrapeISM(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HF-pipeline/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`ISM page ${url} → HTTP ${res.status}`);
  const html = await res.text();

  // Strip tags to text — Cloudflare workers don't ship cheerio; this is good enough
  // for the headline-value regex.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Look for a value statement near the words PMI / index / registered.
  const valueRe = /(?:PMI[®\xae]?\s*(?:at|registered|reading\s+of)?[\s:]+|index\s+(?:at|of)\s+)([0-9]{2}\.[0-9])/i;
  const valueM = text.match(valueRe);
  if (!valueM) return null;
  const value = parseFloat(valueM[1]);
  if (!Number.isFinite(value) || value < 20 || value > 80) return null; // sanity gate

  // Try to pick up the prior-month value too.
  const priorRe = /from\s+([0-9]{2}\.[0-9])\s+in\s+/i;
  const priorM = text.match(priorRe);
  const prior = priorM ? parseFloat(priorM[1]) : null;

  // Try to lift the period (e.g., "April 2026").
  const periodRe = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20[2-3][0-9])/i;
  const periodM = text.match(periodRe);
  let period = null;
  if (periodM) {
    const month = String(MONTHS.indexOf(periodM[1]) + 1).padStart(2, "0");
    period = `${periodM[2]}-${month}`;
  }

  return { value, prior, period, releaseDate: todayStr() };
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod() {
  // ISM PMI is for the prior month (released first business day of next month).
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
