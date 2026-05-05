# SPRINT · Validator tab + cost tracking · 2026-05-06

> Runs **after** [SPRINT_2026-05-06_historical_init.md](SPRINT_2026-05-06_historical_init.md), **before** [SPRINT_validation_cleanup.md](SPRINT_validation_cleanup.md).
> Goal: a Validator tab in v2-balanced that answers two questions at a glance — "did every cron pipeline step succeed last night?" and "what is today's API spend so I never find a huge bill?"

**Effort**: ~3.5h · **Output**: 2 new D1 tables, 1 new dashboard tab, log-write hooks across all metered API callers.

## Design at a glance

Two sources of truth, both surfaced on one tab.

**`PROC_03_Pipeline_runs`** — one row per (run_date, step_name).
Already partially logged by `validation/lib/logger.js` to disk; this MS persists the structured form.

| col | type | meaning |
|---|---|---|
| run_date | TEXT | YYYY-MM-DD |
| step_name | TEXT | "PRESS" / "WH" / "EDGAR" / "MACRO" / "SENTIMENT" / "FUNDAMENTALS" / "UPLOAD" / "VALIDATION" / "VERIFY" / "SYNC" / "PRESS-SUMMARY" |
| status | TEXT | "ok" / "warn" / "fail" / "skip" |
| items | INTEGER | items written / processed |
| started_at | TEXT | ISO timestamp |
| completed_at | TEXT | ISO timestamp |
| duration_ms | INTEGER | computed |
| error | TEXT | null on ok |
| log_excerpt | TEXT | last ~500 chars of the step's log lines, for in-tab inspection |

**`PROC_04_API_usage`** — one row per (run_date, caller, api). Daily aggregate, not per-call.

| col | type | meaning |
|---|---|---|
| run_date | TEXT | YYYY-MM-DD |
| caller | TEXT | "fetch-fundamentals" / "consensus-fetcher" / "news-funnel-orchestrator" / "agent-orchestrator" / etc. |
| api | TEXT | "alphavantage" / "openai" / "gemini" / "polygon" / "finnhub" / "fred" / "yahoo" |
| endpoint | TEXT | optional ("EARNINGS_ESTIMATES", "gpt-5", "gemini-2.5-flash:grounded", …) |
| calls | INTEGER | count for the day |
| cost_usd | REAL | rough estimate; nullable for unmetered |
| budget_cap | INTEGER | 25 for AV; null otherwise (drives the headroom badge) |
| updated_at | TEXT | last write |

Both tables include light idempotency (`UPSERT ON CONFLICT`), so multiple writes per day just bump the counter.

---

## MS-7a · Migration 0046 (~10 min)

`workers/portfolio-ingestor/migrations/0046_add_pipeline_observability.sql`:

```sql
CREATE TABLE IF NOT EXISTS PROC_03_Pipeline_runs (
  run_date TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,
  items INTEGER,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  log_excerpt TEXT,
  PRIMARY KEY (run_date, step_name)
);

CREATE TABLE IF NOT EXISTS PROC_04_API_usage (
  run_date TEXT NOT NULL,
  caller TEXT NOT NULL,
  api TEXT NOT NULL,
  endpoint TEXT,
  calls INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  budget_cap INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_date, caller, api, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_proc03_date ON PROC_03_Pipeline_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_proc04_date ON PROC_04_API_usage(run_date);
```

Apply: `cd workers/portfolio-ingestor && npx wrangler d1 migrations apply portfolio-db --remote`.

**Done when**: tables exist; `SELECT name FROM sqlite_master WHERE name LIKE 'PROC_0%';` returns 4 rows (PROC_01, PROC_02, PROC_03, PROC_04).

---

## MS-7b · Pipeline-step write hook (~30 min)

**File**: `validation/lib/logger.js`

Already has `startStep` / `completeStep` hooks. Wrap the completion path with a D1 push.

Strategy: don't write per step. Instead, at end of pipeline, the orchestrator (`src/pipeline.js`) sends a single batch payload to `portfolio-ingestor /ingest/pipeline-run` with all step rows. One HTTP call per pipeline run, idempotent (UPSERT on PRIMARY KEY).

Add to `src/pipeline.js` `finally { logger.cleanup(); }` block:

```js
// Persist run summary to D1 for the Validator tab.
const stepRows = logger.exportSteps(); // returns [{step_name, status, items, started_at, completed_at, error, log_excerpt}]
try {
  const r = await fetch(`${INGESTOR_URL}/ingest/pipeline-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_date: calendar.todayISO(), steps: stepRows }),
  });
  if (!r.ok) console.error(`Validator persist failed: ${r.status}`);
} catch (err) {
  console.error("Validator persist error:", err.message);
}
```

Add `exportSteps()` to `validation/lib/logger.js`. Tail-buffer the last 500 chars of log per step so `log_excerpt` is filled.

**Ingestor endpoint** `/ingest/pipeline-run` in `workers/portfolio-ingestor/src/worker.js`:

```js
if (path === "/ingest/pipeline-run" && method === "POST") {
  const { run_date, steps } = await req.json();
  for (const s of steps) {
    await db.prepare(`
      INSERT INTO PROC_03_Pipeline_runs
        (run_date, step_name, status, items, started_at, completed_at, duration_ms, error, log_excerpt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_date, step_name) DO UPDATE SET
        status=excluded.status, items=excluded.items, started_at=excluded.started_at,
        completed_at=excluded.completed_at, duration_ms=excluded.duration_ms,
        error=excluded.error, log_excerpt=excluded.log_excerpt
    `).bind(run_date, s.step_name, s.status, s.items ?? null, s.started_at, s.completed_at,
            s.completed_at && s.started_at ? Date.parse(s.completed_at) - Date.parse(s.started_at) : null,
            s.error ?? null, s.log_excerpt ?? null).run();
  }
  return Response.json({ ok: true, written: steps.length });
}
```

**Done when**: one `npm run pipeline` produces 10 rows in PROC_03 with status filled.

---

## MS-7c · API-usage hooks (~45 min)

Add a tiny shared helper `workers/_shared/api-usage.js`:

```js
// Per-call cost estimates. Tune as model prices change.
const COST = {
  "alphavantage": { default: 0 },
  "polygon":     { default: 0 },
  "finnhub":     { default: 0 },
  "fred":        { default: 0 },
  "yahoo":       { default: 0 },
  "openai":      {
    "gpt-5":          0.012,   // ~rough per-call
    "gpt-5-mini":     0.0008,
    "gpt-4o-mini":    0.0003,
    "gpt-4.1-mini":   0.0006,
    default:          0.005,
  },
  "gemini":      {
    "gemini-2.5-flash":           0.0005,
    "gemini-2.5-flash:grounded":  0.035,
    default:                      0.0005,
  },
};

const BUDGET_CAP = { alphavantage: 25 };

export async function recordApiCall(env, { caller, api, endpoint, calls = 1, ok = true }) {
  const today = new Date().toISOString().slice(0, 10);
  const key = endpoint && COST[api]?.[endpoint] !== undefined ? endpoint : "default";
  const cost_per = COST[api]?.[key] ?? 0;
  const cost = cost_per * calls;
  try {
    await env.DB.prepare(`
      INSERT INTO PROC_04_API_usage (run_date, caller, api, endpoint, calls, cost_usd, budget_cap, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_date, caller, api, endpoint) DO UPDATE SET
        calls = calls + excluded.calls,
        cost_usd = COALESCE(cost_usd, 0) + excluded.cost_usd,
        updated_at = excluded.updated_at
    `).bind(today, caller, api, endpoint || "", calls, cost, BUDGET_CAP[api] ?? null, new Date().toISOString()).run();
  } catch (err) {
    console.error(`api-usage write failed (${caller}/${api}): ${err.message}`);
  }
  console.log(`API_USAGE ${today} ${caller} ${api}/${endpoint || ""} +${calls} cost≈$${cost.toFixed(4)}`);
}
```

Wire `recordApiCall` into:

| caller | api | endpoints to track |
|---|---|---|
| `consensus-fetcher` | alphavantage | EARNINGS_ESTIMATES |
| `fetch-fundamentals` (laptop pipeline — uses fetch + a POST to ingestor) | alphavantage | OVERVIEW / INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW |
| `news-funnel-orchestrator` | openai (rerank) | gpt-5-mini |
| `news-funnel-filter` | openai | gpt-5-mini × 33 |
| `topic-feed-builder` | openai | gpt-5-mini |
| 25 agents (orchestrator-fired) | openai | per-agent model |
| `tape-annotation-agent` | openai | gpt-5-mini |
| `news-funnel-orchestrator` | gemini | (only if grounding re-enabled — currently 0) |
| `polygon` callers | polygon | n/a (cost 0, just track count) |

For laptop-side `fetch-fundamentals.js`, write through the ingestor's `/ingest/api-usage` endpoint instead of D1 directly. Same shape as the worker helper.

**Done when**: `SELECT api, SUM(calls), SUM(cost_usd) FROM PROC_04_API_usage WHERE run_date = today GROUP BY api` returns rows.

---

## MS-7d · Ingestor query endpoints (~20 min)

`workers/portfolio-ingestor/src/worker.js`:

```js
// GET /query/pipeline-runs?date=YYYY-MM-DD (default = today)
if (path === "/query/pipeline-runs") {
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const rows = await db.prepare(
    `SELECT * FROM PROC_03_Pipeline_runs WHERE run_date = ? ORDER BY started_at ASC`
  ).bind(date).all();
  return Response.json({ ok: true, date, steps: rows.results || [] });
}

// GET /query/api-usage?date=YYYY-MM-DD&days=1 (default = today; days=7 for week view)
if (path === "/query/api-usage") {
  const days = parseInt(url.searchParams.get("days") || "1", 10);
  const today = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(today) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await db.prepare(
    `SELECT run_date, api, caller, endpoint, SUM(calls) as calls, SUM(cost_usd) as cost_usd, MAX(budget_cap) as budget_cap
     FROM PROC_04_API_usage WHERE run_date BETWEEN ? AND ?
     GROUP BY run_date, api, caller, endpoint
     ORDER BY run_date DESC, cost_usd DESC`
  ).bind(start, today).all();
  return Response.json({ ok: true, from: start, to: today, items: rows.results || [] });
}
```

**Done when**: `curl https://portfolio-ingestor.../query/pipeline-runs` returns today's pipeline steps; `curl .../query/api-usage?days=7` returns the week.

---

## MS-7e · Dashboard tab (~1.5h)

### `dashboard/server.js`

```js
app.get("/api/pipeline-runs", async (req, res) => {
  try {
    const date = req.query.date;
    const data = await fetchFromWorker(date ? `/query/pipeline-runs?date=${date}` : "/query/pipeline-runs");
    res.json(data);
  } catch (err) { handleD1Error(res, "/api/pipeline-runs", err); }
});

app.get("/api/api-usage", async (req, res) => {
  try {
    const days = req.query.days || 1;
    const data = await fetchFromWorker(`/query/api-usage?days=${days}`);
    res.json(data);
  } catch (err) { handleD1Error(res, "/api/api-usage", err); }
});
```

### `dashboard/mockup/v2-balanced/index.html`

Add a top-level tab (next to Today / Map / Tape — wherever the current tab list lives). Tab contents — keep it lean, two sections:

**Section A — "Last cron run" (today's pipeline steps)**

A table with one row per step:

| Step | Status | Items | Duration | Last log |
|---|---|---:|---:|---|
| PRESS | ✅ ok | 12 | 5m 03s | "wrote AA_press_summary.json (12 tickers)" |
| WH | ✅ ok | 3 | 18s | … |
| EDGAR | ✅ ok | 25 | 1m 12s | … |
| MACRO | ⚠ warn | 9 | 22s | "ISM 404 — skipped" |
| SENTIMENT | ✅ ok | 3 | 14s | … |
| FUNDAMENTALS | ⚠ warn | 1 | 1m 58s | "INCOME_STATEMENT errors=1" |
| UPLOAD | ✅ ok | — | 4s | … |
| VALIDATION | ✅ ok | 28 | 3m 44s | "28 passed, 0 failed" |
| VERIFY | ✅ ok | 28 | — | … |
| SYNC | ✅ ok | 5/5 | 1s | "endpoints synced" |

Color-code status; click row to expand `log_excerpt` in a modal (reuse the existing report-modal component).

**Section B — "API spend (last 7 days)"**

A horizontal stacked bar per day showing cost contribution by API (openai / gemini / alphavantage / polygon / finnhub / fred / yahoo). Plus a single big number — **today total $X.XX**.

Below the chart, a flat table:

| API | Endpoint | Calls today | Cost today | Calls this week | Cost this week | Budget |
|---|---|---:|---:|---:|---:|---|
| alphavantage | EARNINGS_ESTIMATES | 3 / 25 | $0.00 | 18 / 175 | $0.00 | 25/day cap |
| openai | gpt-5 | 12 | $0.14 | 84 | $1.00 | — |
| openai | gpt-5-mini | 38 | $0.03 | 250 | $0.20 | — |
| polygon | financials | 25 | $0.00 | 175 | $0.00 | — |
| … | | | | | | |

A `BUDGET WARNING` banner appears if any API hit ≥80% of its `budget_cap`.

**Done when**: open `http://hedge-server:4200/mockup/v2-balanced/`, click Validator tab, see today's pipeline steps + 7-day cost view. Screenshot to `docs/active/sprint-output/lights-on-MS-7e.png`.

---

## MS-7f · Smoke + commit (~15 min)

1. `npm run pipeline` once on hedge-server.
2. Verify PROC_03 has 10 rows with statuses.
3. Verify PROC_04 has at least one row per metered API hit.
4. Open Validator tab, confirm both sections render.
5. One commit per MS (7a–7e), push.

**Done when**: tag pushed, screenshot committed.

---

## Stop and ask

- If MS-7c reveals an API caller we forgot, add it to the table above before continuing — better one extra round of edits than a blind spot in the cost view.
- If today's `cost_usd` is wildly higher than the ~$1.50/weekday forecast, **stop the pipeline** and inspect — that's the signal this whole sprint exists to catch.

## Out of scope

- Per-call audit log (we aggregate by day; per-call rows would explode the table). Add later if needed.
- Cost projection / budget alarm via email or push (D1 is read-only here; alarms are a separate small feature).
- Historical replay of pre-2026-05-06 runs — there's no source data for those.

---

## Order of operations 2026-05-06 (final)

| Order | Sprint | Effort |
|---|---|---|
| 1 | [SPRINT_2026-05-06_pre_init_api_audit.md](SPRINT_2026-05-06_pre_init_api_audit.md) | ~45 min |
| 2 | [SPRINT_2026-05-06_historical_init.md](SPRINT_2026-05-06_historical_init.md) | ~5h |
| 3 | **this sprint** | ~3.5h |
| 4 | [SPRINT_validation_cleanup.md](SPRINT_validation_cleanup.md) | ~2h |

Total tomorrow: ~11h. If that's too much in one day, the natural break is between #2 and #3 (dashboard is fully populated end of #2; the Validator tab can slip to day-after if needed).
