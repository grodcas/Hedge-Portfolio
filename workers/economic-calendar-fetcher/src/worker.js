/**
 * ECONOMIC-CALENDAR-FETCHER — writes to MACRO_STATE_calendar
 *
 * Pulls Finnhub's /calendar/economic endpoint for today..today+45d, filters
 * to US + impact ∈ (high, medium), canonicalizes every raw event name into
 * a short event_code, and upserts one row per (event_date, event_code,
 * country) into MACRO_STATE_calendar.
 *
 * Sprint 11 replaces GPT-generated `catalysts[]` in BETA_10_Daily_macro with
 * this real release schedule — narrator signposts now cite verifiable dates.
 *
 * Endpoints:
 *   GET /build    — force a pull. Returns {ok, raw, kept, inserted, from, to}.
 *   GET /status   — row count + date range + next 8 upcoming events.
 *
 * Cron:
 *   Daily at 00:00 UTC. Finnhub refreshes `estimate` (consensus) closer to
 *   each release; the ON CONFLICT DO UPDATE flushes those through.
 */

const FINNHUB_URL = "https://finnhub.io/api/v1/calendar/economic";
const WINDOW_DAYS = 45;

// Finnhub label → canonical event_code. First regex to match wins; unknown
// events fall through to the uppercased first word so event_code is never NULL.
const EVENT_CODE_MAP = [
  [/fomc.*rate|federal.?funds.?rate|fed.?rate.?decision/i, "FOMC"],
  [/fomc.*minutes/i, "FOMC_MINS"],
  [/beige book/i, "BEIGE"],
  [/core.?cpi|\bcpi\b.*core/i, "CORE_CPI"],
  [/\bcpi\b/i, "CPI"],
  [/core.?pce|\bpce\b.*core/i, "CORE_PCE"],
  [/\bpce\b/i, "PCE"],
  [/\bppi\b/i, "PPI"],
  [/nonfarm|nfp\b|employment situation/i, "NFP"],
  [/initial jobless claims/i, "JOBLESS"],
  [/continuing jobless claims/i, "JOBLESS_CONT"],
  [/\bgdp\b.*advance/i, "GDP_ADV"],
  [/\bgdp\b.*(second|revised)/i, "GDP_2ND"],
  [/\bgdp\b.*(third|final)/i, "GDP_3RD"],
  [/\bgdp\b/i, "GDP"],
  [/retail sales/i, "RETAIL"],
  [/\bism\b.*manufacturing/i, "ISM_MFG"],
  [/\bism\b.*services/i, "ISM_SVC"],
  [/michigan|consumer sentiment/i, "MICH"],
  [/jolts/i, "JOLTS"],
  [/durable goods/i, "DURABLE"],
  [/housing starts|building permits/i, "HOUSING"],
  [/existing home sales/i, "HOME_SALES_EX"],
  [/new home sales/i, "HOME_SALES_NEW"],
  [/conference board.*consumer confidence|\bconsumer confidence\b/i, "CONF_BOARD"],
  [/trade balance/i, "TRADE"],
  [/personal income|personal spending/i, "PERSONAL_INCOME"],
  [/adp/i, "ADP"],
  [/empire state|philly fed|dallas fed|kansas fed|richmond fed|chicago fed national/i, "REG_FED"],
  [/s&p global.*pmi/i, "SP_PMI"],
];

function deriveEventCode(label) {
  const s = String(label || "").trim();
  if (!s) return "UNKNOWN";
  for (const [re, code] of EVENT_CODE_MAP) {
    if (re.test(s)) return code;
  }
  const first = s.match(/[A-Za-z]+/);
  return first ? first[0].toUpperCase() : "UNKNOWN";
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/build") return Response.json(await build(env));
      if (url.pathname === "/status") return Response.json(await status(env));
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(build(env).catch((e) => console.error(`[cal-fetcher] cron: ${e.message}`)));
  },
};

async function build(env) {
  const key = env.FINNHUB_KEY;
  if (!key) throw new Error("FINNHUB_KEY secret not set");

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + WINDOW_DAYS * 86400000);
  const to = toDate.toISOString().slice(0, 10);

  const url = `${FINNHUB_URL}?from=${from}&to=${to}&token=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`finnhub → HTTP ${res.status}`);
  const body = await res.json();
  const raw = Array.isArray(body?.economicCalendar) ? body.economicCalendar : [];

  const events = raw
    .filter((e) => e.country === "US" && (e.impact === "high" || e.impact === "medium"))
    .map((e) => {
      const time = e.time || "";
      const event_date = time.slice(0, 10);
      const event_time = time.length > 10 ? time.slice(11, 19) : null;
      return {
        event_date,
        event_time,
        country: "US",
        event_code: deriveEventCode(e.event),
        event_label: e.event,
        impact: e.impact,
        consensus: e.estimate != null ? String(e.estimate) : null,
        prior: e.prev != null ? String(e.prev) : null,
        unit: e.unit || null,
      };
    })
    .filter((e) => e.event_date);

  const now = new Date().toISOString();
  let inserted = 0;
  for (const e of events) {
    // Include the raw event_label in the hash so same-day same-code releases
    // with different components (e.g. 3 S&P PMIs on the same morning) keep
    // distinct rows instead of collapsing via ON CONFLICT.
    const labelKey = String(e.event_label || "").trim().toLowerCase();
    const id = await shortHash(`${e.event_date}|${e.event_code}|${e.country}|${labelKey}`);
    await env.DB.prepare(
      `INSERT INTO MACRO_STATE_calendar
         (id, event_date, event_time, country, event_code, event_label,
          impact, consensus, prior, unit, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'finnhub', ?)
       ON CONFLICT(id) DO UPDATE SET
         event_time  = excluded.event_time,
         event_label = excluded.event_label,
         impact      = excluded.impact,
         consensus   = excluded.consensus,
         prior       = excluded.prior,
         unit        = excluded.unit,
         created_at  = excluded.created_at`,
    )
      .bind(
        id, e.event_date, e.event_time, e.country, e.event_code, e.event_label,
        e.impact, e.consensus, e.prior, e.unit, now,
      )
      .run();
    inserted++;
  }

  return { ok: true, from, to, raw: raw.length, kept: events.length, inserted };
}

async function status(env) {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS count,
            MIN(event_date) AS earliest,
            MAX(event_date) AS latest,
            SUM(CASE WHEN impact='high' THEN 1 ELSE 0 END) AS high_count,
            SUM(CASE WHEN impact='medium' THEN 1 ELSE 0 END) AS medium_count
       FROM MACRO_STATE_calendar WHERE country='US'`,
  ).first();

  const upcoming = await env.DB.prepare(
    `SELECT event_date, event_time, event_code, event_label, impact
       FROM MACRO_STATE_calendar
      WHERE country='US' AND event_date >= date('now')
      ORDER BY event_date, event_time LIMIT 8`,
  ).all();

  return { ok: true, ...summary, upcoming: upcoming.results || [] };
}

async function shortHash(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
