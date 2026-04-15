# Decommissioned Workers

Source code preserved here is **not deployed** and **not referenced** by the
active pipeline. Kept on disk in case the feature is revived later.

## trend-orchestrator + trend-builder (ALPHA trend chain)

**What it did**: For a given ticker, fetched the last 4 10-K/10-Q reports
from `ALPHA_01_Reports`, made sure each had a summary (queueing
`report-orchestrator` for any missing), then queued `trend-builder` which
synthesized a multi-quarter narrative trend stored in `ALPHA_04_Trends`.

**Why decommissioned**:
- Only triggered manually via `POST /run {action:"trend", ticker:"X"}`.
- No cron, no auto-trigger from `daily_update`.
- The dashboard rendered `ALPHA_04_Trends` in a "today updates" feed but the
  table was effectively never refreshed, so the panel was always stale.
- `tickerTrends` rendering and the `/api/ticker-trends` endpoint were
  removed from the dashboard at the same time as this archive.

**How to revive**:
1. `git mv archive/decommissioned-workers/trend-orchestrator workers/`
2. `git mv archive/decommissioned-workers/trend-builder workers/`
3. `cd workers/trend-orchestrator && npx wrangler deploy`
4. `cd workers/trend-builder && npx wrangler deploy`
5. Re-add service bindings to `workers/job-engine-workflow/wrangler.jsonc`:
   ```jsonc
   { "binding": "TREND_ORCHESTRATOR", "service": "trend-orchestrator", "environment": "production" },
   { "binding": "trend_builder",      "service": "trend-builder",      "environment": "production" },
   ```
6. Re-add switch cases in `workers/job-engine-workflow/src/index.js` `runJob()`:
   ```js
   case "trend-orchestrator":
     return await this.env.TREND_ORCHESTRATOR.fetch("https://internal/process-trend", { method: "POST", body });
   case "trend-builder":
     return await this.env.trend_builder.fetch("https://internal/build-trend", { method: "POST", body });
   ```
7. Re-add the `action === "trend"` handler in the same file's fetch handler.
8. Decide on a trigger: weekly cron iterating 25 tickers, or user-driven
   manual button in the dashboard.
9. Re-add the dashboard `tickerTrends` rendering — git history before this
   commit shows the original code in `dashboard/app.js` and `dashboard/server.js`.

## qk-* workers (NOT decommissioned)

`qk-cluster-summarizer`, `qk-structure-builder`, and `qk-report-summarizer`
remain deployed and active. They are still used by `report-orchestrator`
when SEC 10-K/10-Q filings arrive via `/ingest/reports`. Do not archive them.
