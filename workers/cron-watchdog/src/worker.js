/**
 * CRON-WATCHDOG — hourly health check on the 10 Tier-1 cron entry-points.
 *
 * Reads PROC_05_Cron_runs (filled by _shared/cron-log.js wrapping each
 * scheduled() handler) and compares each cron's most-recent fire to its
 * expected schedule. A miss is recorded as `stale` with the gap in hours.
 *
 * Endpoints:
 *   GET /status — JSON snapshot of all 10 crons (last_fire, expected_within_h,
 *                  stale boolean, gap_h, last_ok).
 *
 * Cron: hourly at HH:00. Logs a structured line via console.log so the CF
 * dashboard's log stream shows what the watchdog saw.
 */

import { logCronRun } from "../../_shared/cron-log.js";

// One row per cron we track. expected_within_h = how many hours since last
// fire is acceptable before we flag "stale". Set generously — daily crons get
// 26h (24 + 2h slack), Mon-Fri crons get 80h (Sat–Mon coverage), the
// orchestrator gets 80h for the same reason.
const TRACKED = [
  { worker: "agent-orchestrator",          schedule: "0 22 * * 1-5",   expected_within_h: 80 },
  { worker: "consensus-fetcher",           schedule: "0 13 * * 1-5",   expected_within_h: 80 },
  { worker: "economic-calendar-fetcher",   schedule: "0 0 * * *",      expected_within_h: 26 },
  { worker: "fomc-statement-fetcher",      schedule: "0 0 * * *",      expected_within_h: 26 },
  { worker: "macro-state-fetcher",         schedule: "10 0 * * *",     expected_within_h: 26 },
  { worker: "sentiment-state-fetcher",     schedule: "25 0 * * *",     expected_within_h: 26 },
  { worker: "yfinance-cross-asset-fetcher", schedule: "20 0 * * *",    expected_within_h: 26 },
  { worker: "topic-feed-builder",          schedule: "0 2 * * *",      expected_within_h: 26 },
  { worker: "valuation-curve-builder:short", schedule: "15 1 * * *",   expected_within_h: 26 },
  { worker: "valuation-curve-builder:long_auto", schedule: "30 1 * * *", expected_within_h: 26 },
  { worker: "big-movers-why",              schedule: "0 7 * * 2-6",    expected_within_h: 80 },
];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/status") {
        return Response.json(await checkAll(env));
      }
      // /run does the same work the cron does — useful for ad-hoc verification
      // without waiting for the next hourly tick. Logs a row to PROC_05_Cron_runs.
      if (url.pathname === "/run") {
        const out = await logCronRun(env, "cron-watchdog", async () => {
          const r = await checkAll(env);
          console.log(`[watchdog] /run ${r.summary} stale=${r.stale_count} ok=${r.ok_count}`);
          return { rows: r.checked.length, stale: r.stale_count };
        });
        const fresh = await checkAll(env);
        return Response.json({ ok: true, run_result: out, status: fresh });
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      logCronRun(env, "cron-watchdog", async () => {
        const out = await checkAll(env);
        // One structured log line so the CF dashboard's stream has a
        // single greppable row per hour.
        console.log(`[watchdog] ${out.summary} stale=${out.stale_count} ok=${out.ok_count} checked=${out.checked.length}`);
        if (out.stale_count > 0) {
          for (const c of out.checked) {
            if (c.stale) console.error(`[watchdog] STALE ${c.worker}: ${c.gap_h}h since last fire (limit ${c.expected_within_h}h)`);
          }
        }
        return { rows: out.checked.length, stale: out.stale_count };
      }).catch((e) => console.error(`[watchdog] cron: ${e.message}`)),
    );
  },
};

async function checkAll(env) {
  const now = Date.now();
  const checked = [];
  let stale_count = 0;
  let ok_count    = 0;

  for (const t of TRACKED) {
    const row = await env.DB.prepare(
      `SELECT fired_at, ok, duration_ms, rows_written, error
         FROM PROC_05_Cron_runs
        WHERE worker = ?
        ORDER BY fired_at DESC
        LIMIT 1`,
    ).bind(t.worker).first();

    if (!row) {
      checked.push({
        worker: t.worker,
        schedule: t.schedule,
        expected_within_h: t.expected_within_h,
        last_fire: null,
        gap_h: null,
        stale: true,
        last_ok: null,
        note: "no rows in PROC_05_Cron_runs (worker may not have fired since deploy)",
      });
      stale_count++;
      continue;
    }

    const lastMs = Date.parse(row.fired_at);
    const gap_h  = Math.round((now - lastMs) / 3_600_000 * 10) / 10;
    const stale  = gap_h > t.expected_within_h;
    if (stale) stale_count++; else ok_count++;

    checked.push({
      worker: t.worker,
      schedule: t.schedule,
      expected_within_h: t.expected_within_h,
      last_fire: row.fired_at,
      gap_h,
      stale,
      last_ok: row.ok === 1,
      duration_ms: row.duration_ms,
      rows_written: row.rows_written,
      error: row.error,
    });
  }

  const summary = stale_count === 0
    ? "all-green"
    : `STALE x${stale_count}: ${checked.filter(c => c.stale).map(c => c.worker).join(", ")}`;

  return {
    ok: stale_count === 0,
    checked_at: new Date().toISOString(),
    summary,
    stale_count,
    ok_count,
    checked,
  };
}
