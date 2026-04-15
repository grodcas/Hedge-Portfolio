# Pipeline Health-Check Fixes — Execution Plan

**Created**: 2026-04-13
**Status**: pending
**Source**: health check report after Round 4 resilience changes
**Scope**: 4 fixes (2 medium, 2 minor) — all under ~80 lines of code total

---

## Context

After Round 4 (fail-forward + retry policy + requires-gate + idempotency), a static health check found 4 real issues. None are critical, none block daily runs, but two are correctness edge cases and two are cleanup. This plan executes all four with verifications.

The pipeline is on commit `0569f02`. Nothing is broken — these are refinements.

---

## Fix #1 — `trend-orchestrator` queues without waves (BUG, medium)

**Problem**: When manually triggered via `action: "trend"`, `trend-orchestrator` queues both `trend-builder` and (per-missing-report) `report-orchestrator` without setting the `wave` column. Both default to wave=1 and run in parallel. But `trend-builder` reads `summary` from ALPHA_01_Reports, which is populated by report-orchestrator → they have a strict dependency that the wave system isn't enforcing.

**File**: `workers/trend-orchestrator/src/worker.js`

**Current code (around lines 14-22 and 58-66)**:
```js
// Final job: trend-builder (no wave)
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status)
  VALUES (?, ?, ?, ?)
`).bind(now, "trend-builder", JSON.stringify({ ticker: T }), "pending").run();

// Per missing report: report-orchestrator (no wave)
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status)
  VALUES (?, ?, ?, ?)
`).bind(now, "report-orchestrator", JSON.stringify({ report_id: r.id }), "pending").run();
```

**Fix**: assign waves so report-orchestrator runs first, then trend-builder, AND add a `requires` field to trend-builder so the requires-gate enforces it even if the wave order is wrong:

```js
// Final job: trend-builder at wave 5000 (runs LAST, after all reports)
//   requires field is unused for trend-builder because there are
//   multiple report_ids — we use wave ordering instead.
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
  VALUES (?, ?, ?, ?, ?)
`).bind(now, "trend-builder", JSON.stringify({ ticker: T }), "pending", 5000).run();

// Per missing report: report-orchestrator at wave 4500 (runs first)
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
  VALUES (?, ?, ?, ?, ?)
`).bind(now, "report-orchestrator", JSON.stringify({ report_id: r.id }), "pending", 4500).run();
```

Wave numbers chosen to be ABOVE the daily_update range (1000-4000) so manual `action: "trend"` doesn't interleave with a running daily_update.

**Deploy**: `cd workers/trend-orchestrator && npx wrangler deploy`

**Verify**:
1. `npx wrangler d1 execute portfolio-db --remote --command "DELETE FROM PROC_01_Job_queue WHERE worker IN ('trend-builder','report-orchestrator')"` (cleanup)
2. Trigger: `curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run -d '{"action":"trend","ticker":"AAPL"}'`
3. Check the queue: `wrangler d1 execute portfolio-db --remote --command "SELECT wave, worker, status FROM PROC_01_Job_queue WHERE worker IN ('trend-builder','report-orchestrator') ORDER BY id DESC LIMIT 10"`
4. Expect: report-orchestrator entries at wave=4500, one trend-builder entry at wave=5000.

---

## Fix #2 — `report-orchestrator` Form 4 / 8-K paths missing waves (MINOR)

**Problem**: `report-orchestrator` queues `form4-summarizer` and `8k-summarizer` without the `wave` column. They default to wave=1, which is lower than the daily_update wave 1000. If a Form 4 / 8-K is auto-queued via `/ingest/reports` while a daily_update is running, the workflow's MIN(wave) selector would pick the wave=1 job FIRST, interrupting the daily_update flow.

**File**: `workers/report-orchestrator/src/worker.js`

**Current code (around lines 32-40 for Form 4 and 49-57 for 8-K)**:
```js
// Form 4
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status)
  VALUES (?, ?, ?, ?)
`).bind(now, "form4-summarizer", JSON.stringify({ report_id }), "pending").run();

// 8-K
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status)
  VALUES (?, ?, ?, ?)
`).bind(now, "8k-summarizer", JSON.stringify({ report_id }), "pending").run();
```

**Fix**: add `wave=20` (low enough to run promptly but doesn't preempt daily_update wave 1000):

```js
// Form 4
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
  VALUES (?, ?, ?, ?, ?)
`).bind(now, "form4-summarizer", JSON.stringify({ report_id }), "pending", 20).run();

// 8-K
await db.prepare(`
  INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave)
  VALUES (?, ?, ?, ?, ?)
`).bind(now, "8k-summarizer", JSON.stringify({ report_id }), "pending", 20).run();
```

Note: the existing qk-* queue lines at waves 10 and 11 (for 10-K/10-Q) stay as-is. The numbering: 10 = qk-structure-builder, 11 = qk-report-summarizer, 20 = form4 + 8k. SEC chain occupies waves 10-20.

**Why wave=20 and not wave=1**: any value < 1000 keeps SEC processing prioritized over daily_update (so SEC reports get summarized as soon as they arrive), but > 1 means a stray wave=1 from elsewhere doesn't preempt them.

**Deploy**: `cd workers/report-orchestrator && npx wrangler deploy`

**Verify**: same as Fix #1 — trigger an `/ingest/reports` POST with a fake Form 4 payload (or the existing Phase 1.4 test pattern), then query the queue to confirm wave=20 entries.

---

## Fix #3 — `daily_update` DELETE wipes pending SEC auto-queue (POTENTIAL DATA LOSS)

**Problem**: `daily_update`'s clear step DELETEs ALL rows from PROC_01_Job_queue. If a `report-orchestrator` job was just auto-queued by `/ingest/reports` (via Phase 1.4 wiring) and is still pending, the DELETE wipes it. The SEC filing in ALPHA_01_Reports never gets its summary populated.

**File**: `workers/job-engine-workflow/src/index.js`

**Current code (around lines 280-283 in the `daily_update` action handler)**:
```js
// Clear all old jobs before starting fresh — includes failed/skipped
// from previous runs so stale state doesn't accumulate.
await this_env.DB.prepare(`
  DELETE FROM PROC_01_Job_queue WHERE status IN ('done','pending','running','failed','skipped')
`).run();
```

**Fix**: scope the DELETE to the daily_update wave range (1000-4999). SEC processing at waves 10/11/20 and any other low-wave jobs survive.

```js
// Clear OLD daily_update jobs only — preserve auto-queued SEC processing
// (waves 10/11/20 from report-orchestrator) and manual trend-orchestrator
// jobs (wave 4500/5000), which are independent of the daily_update flow.
await this_env.DB.prepare(`
  DELETE FROM PROC_01_Job_queue
  WHERE wave >= 1000 AND wave < 5000
    AND status IN ('done','pending','running','failed','skipped')
`).run();
```

**Wave range explanation**:
- 1000-4000: daily_update main waves (price-fetcher through consensus-validator)
- 1100-1400: beta sub-chain (gen-orchestrator branch)
- 5000+ (after Fix #1): manual trend-orchestrator jobs
- Anything else: SEC processing (10, 11, 20) or future expansions

The range `[1000, 5000)` covers all daily_update + sub-chain waves and leaves the rest alone.

**Deploy**: `cd workers/job-engine-workflow && npx wrangler deploy`

**Verify**:
1. Insert a fake SEC job at wave=20: `wrangler d1 execute portfolio-db --remote --command "INSERT INTO PROC_01_Job_queue (date, worker, input, status, wave) VALUES (datetime('now'), 'form4-summarizer', '{\"report_id\":\"test\"}', 'pending', 20)"`
2. Trigger daily_update: `curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run -d '{"action":"daily_update"}'`
3. Wait 5 seconds, then query: `wrangler d1 execute portfolio-db --remote --command "SELECT wave, worker, status FROM PROC_01_Job_queue WHERE worker='form4-summarizer' AND input='{\"report_id\":\"test\"}'"`
4. Expect: the test row still exists with wave=20 (or has been processed if the workflow picked it up — either way, it wasn't wiped)
5. Cleanup: `wrangler d1 execute portfolio-db --remote --command "DELETE FROM PROC_01_Job_queue WHERE input='{\"report_id\":\"test\"}'"`

---

## Fix #4 — Remove orphaned `daily-macro-summarizer` worker (DEAD CODE)

**Problem**: `daily-macro-summarizer` was dropped from `daily_update` in Phase 1.1 because `macro-intelligence-builder` supersedes it (both write to BETA_10_Daily_macro). The worker still exists in:
- The repo (`workers/daily-macro-summarizer/`)
- Deployed on Cloudflare (still consuming a worker slot)
- `job-engine-workflow/wrangler.jsonc` as a service binding `DAILY_MACRO_SUMMARIZER`
- `job-engine-workflow/src/index.js` as a switch case
- `job-engine-workflow/src/index.js` as `action: "daily_macro"` handler
- `dashboard/server.js` as `/api/daily-macro/:date` proxy (this one stays — proxies to `/query/daily-macro` which still exists and reads BETA_10)

**Files affected**:
1. `workers/job-engine-workflow/wrangler.jsonc` — remove the `DAILY_MACRO_SUMMARIZER` service binding (4 lines)
2. `workers/job-engine-workflow/src/index.js` — remove:
   - Switch case `case "daily-macro-summarizer":` (~3 lines)
   - Action handler `if (action === "daily_macro") { ... }` (~7 lines)
3. `workers/daily-macro-summarizer/` — entire directory delete

**Keep**:
- `dashboard/server.js` `/api/daily-macro/:date` — still works because it proxies to `/query/daily-macro`, which reads `BETA_10_Daily_macro` (now written by `macro-intelligence-builder` in JSON format). The dashboard tab handles both old text and new JSON formats.
- `portfolio-ingestor` `/query/daily-macro` endpoint — still serves the BETA_10 row.

**Wrangler.jsonc removal block** (in `workers/job-engine-workflow/wrangler.jsonc`):
```jsonc
{
  "binding": "DAILY_MACRO_SUMMARIZER",
  "service": "daily-macro-summarizer",
  "environment": "production"
},
```

**Switch case removal** (in `workers/job-engine-workflow/src/index.js`):
```js
case "daily-macro-summarizer":
  return await this.env.DAILY_MACRO_SUMMARIZER.fetch("https://internal/process-daily-macro", { method: "POST", body });
```

**Action handler removal**:
```js
if (action === "daily_macro") {
  const now = new Date().toISOString();
  await this_env.DB.prepare(`
    INSERT INTO PROC_01_Job_queue (date, worker, input, status)
    VALUES (?, ?, ?, ?)
  `).bind(now, "daily-macro-summarizer", "{}", "pending").run();
}
```

**Steps**:
1. Edit `workers/job-engine-workflow/wrangler.jsonc` — remove the DAILY_MACRO_SUMMARIZER service binding block
2. Edit `workers/job-engine-workflow/src/index.js` — remove switch case + action handler
3. `cd workers/daily-macro-summarizer && echo "y" | npx wrangler delete` — remove from Cloudflare
4. `cd /Users/gines/Hedge-Portfolio && rm -rf workers/daily-macro-summarizer` — remove from repo
5. `cd workers/job-engine-workflow && npx wrangler deploy` — redeploy with the binding removed (must be AFTER step 3, otherwise the deploy fails on "service not found")

**Order matters**: `wrangler delete` the worker BEFORE removing the binding, because removing the binding from job-engine-workflow's wrangler.jsonc requires the referenced service to exist OR not exist consistently. Actually the cleanest order is: remove binding first → deploy job-engine → then delete worker → then delete repo dir.

Wait — that's wrong. If I deploy job-engine WITHOUT the binding while daily-macro-summarizer is still deployed, that's fine (orphaned worker, harmless). But if I delete daily-macro-summarizer FIRST without removing the binding, the next deploy of job-engine (which still references it) would fail. So:

1. Remove binding from job-engine wrangler.jsonc → deploy → no more reference
2. Delete daily-macro-summarizer from CF → safe
3. Delete dir from repo → cleanup

**Verify**:
- After step 1: `npx wrangler deployments list --name job-engine-workflow` should succeed
- After step 2: `npx wrangler deployments list --name daily-macro-summarizer` should return 404
- Trigger a daily_update — it should still complete successfully (BETA_10 still gets written by macro-intelligence-builder)
- Load dashboard Macro tab — should still render

---

## Optional Fix #5 — Clean up `BETA_01_News` reference in content-validator (TRIVIAL)

**File**: `validation/agents/content-validator.js`

**Problem**: There's a config entry referencing the dead `BETA_01_News` table:
```js
{
  id: "news-summary",
  name: "News Summaries (BETA_01)",
  summaryTable: "BETA_01_News",
  ...
}
```

This is a config object describing a possible validation target. It's only used if someone calls the content-validator with `type: "news-summary"`. Since BETA_01 is frozen, that validation would return empty. Not a bug, just an orphan.

**Fix**: remove the entry. ~10 lines.

**Verify**: `node --check validation/agents/content-validator.js`

**Severity**: trivial — skip if you're in a hurry. Including for completeness.

---

## Execution Order

Fixes #1, #2, #3, #4 are independent. Recommended order:

1. **Fix #4 first** (dead code removal — least risk, most cleanup value)
2. **Fix #3 second** (DELETE scope change — affects pipeline behavior)
3. **Fix #1 third** (trend-orchestrator waves — only matters when you manually call trend)
4. **Fix #2 fourth** (form4/8k waves — minor consistency)
5. **Fix #5 last** (or skip)

Each fix is one commit. After all 4-5 fixes, push as one batch or 4-5 separate commits.

---

## Single combined verification (after all fixes deployed)

1. **Trigger daily_update**: `curl -X POST https://job-engine-workflow.gines-rodriguez-castro.workers.dev/run -d '{"action":"daily_update"}'`
2. **Watch the queue**: confirm only the expected 9 jobs appear (price, earnings, fundamentals, beta-trend-orch + macro-intel + assessment + event-attribution + probability + consensus). Note: `daily-macro-summarizer` should NOT appear.
3. **Wait for completion**: `~7 min`
4. **Query pipeline-health**: confirm `done=10` (or whatever the final job count is), `failed=0`, `skipped=0`
5. **Manually queue a fake form4**: insert a row at wave=20, trigger daily_update mid-way, verify the row survives
6. **Manually call trend action**: `curl -X POST .../run -d '{"action":"trend","ticker":"AAPL"}'`. Verify queue shows report-orchestrator at wave=4500 and trend-builder at wave=5000.

---

## Files modified summary

| File | Fix | Lines |
|---|---|---|
| `workers/trend-orchestrator/src/worker.js` | #1 | ~6 |
| `workers/report-orchestrator/src/worker.js` | #2 | ~4 |
| `workers/job-engine-workflow/src/index.js` | #3 + #4 | ~15 |
| `workers/job-engine-workflow/wrangler.jsonc` | #4 | -5 |
| `workers/daily-macro-summarizer/` | #4 | DELETE dir |
| `validation/agents/content-validator.js` | #5 (optional) | -10 |

**Total**: ~40 lines of net change + one directory deletion.

---

## Rollback notes

Each fix is one commit. If something breaks:

- **Fix #1**: `git revert <sha>` and redeploy `trend-orchestrator`. Manual `action: "trend"` reverts to the LIFO behavior (broken but matches pre-fix state).
- **Fix #2**: `git revert <sha>` and redeploy `report-orchestrator`. Form 4 / 8-K go back to wave=1.
- **Fix #3**: `git revert <sha>` and redeploy `job-engine-workflow`. DELETE goes back to wiping everything.
- **Fix #4**: Worker is gone from CF — to roll back, you'd have to redeploy from a previous commit's source. The dashboard `/api/daily-macro/:date` doesn't break either way because `macro-intelligence-builder` is the live writer.

---

## Out of scope (not in this plan)

Things flagged in the health check report but NOT in this plan because they're observations, not bugs:
- News funnel idempotency is all-or-nothing (intentional design)
- `8k-summarizer` and `form4-summarizer` having `limit=0` retry default (correct — they're AI-heavy)
- Any documentation updates (REWORK_PLAN.md still mentions BETA_11 etc. — out of scope)
