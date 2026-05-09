// workers/_shared/cron-log.js
//
// Wrap every Tier-1 cron worker's scheduled() handler so each fire writes
// a row to PROC_05_Cron_runs. cron-watchdog reads this table hourly to
// surface silent Cloudflare cron-delivery misses.
//
// Usage:
//   import { logCronRun } from "../../_shared/cron-log.js";
//
//   async scheduled(_event, env, ctx) {
//     ctx.waitUntil(logCronRun(env, "macro-state-fetcher", () => build(env)));
//   }
//
// The wrapper records: when scheduled() ran, whether the inner work threw,
// how long it took, and (best-effort) how many rows the inner function
// reported writing. Telemetry must not break the cron itself, so all
// failures inside the recorder are swallowed.

export async function logCronRun(env, worker, fn) {
  const startMs   = Date.now();
  const firedAt   = new Date(startMs).toISOString();
  let ok          = 0;
  let errorMsg    = null;
  let rowsWritten = null;
  let result;

  try {
    result = await fn();
    ok = 1;
    if (result && typeof result === "object") {
      rowsWritten = result.inserted ?? result.count ?? result.rows ?? null;
    }
    return result;
  } catch (e) {
    errorMsg = e?.message ?? String(e);
    throw e;
  } finally {
    const durationMs = Date.now() - startMs;
    try {
      await env.DB.prepare(
        `INSERT INTO PROC_05_Cron_runs
           (worker, fired_at, ok, duration_ms, rows_written, error)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(worker, firedAt, ok, durationMs, rowsWritten, errorMsg).run();
    } catch { /* swallow — telemetry must not break the cron */ }
  }
}
