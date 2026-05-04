> [INDEX](../INDEX.md) · [Audit sprint](SPRINT_2026-05-04_dashboard_balance.md) · [Pipeline impl](SPRINT_pipeline_implementation.md) · [Agent foundation](SPRINT_agent_foundation.md) · [Agent rollout](SPRINT_agent_rollout.md)

# SPRINT · End-to-end validation + cleanup

**Model**: Sonnet 4.6 · **Effort**: ~2h · **Output**: `BUGS_FOUND.md` (can be empty), optional `NOTES.md` for walkthrough impressions.

## Goal

Walk the floor after the build sprints have shipped. Catch silent breakage. Log — don't fix — anything bigger than a typo.

## Rules

- No new features. No refactors. Soft-delete only.
- Trivial fixes inline (typos, broken doc links, one-line bugs). Anything else → `BUGS_FOUND.md`.
- Read-only verification wherever possible. Don't truncate tables, don't force-fail jobs to test fallback.
- Token budget: **~50 tool calls**. If you exceed 60, stop and report.

## Steps

### 1. Smoke test (~30 min)

- Serve `dashboard/mockup/v2-balanced/index.html`. Open in browser. Scroll top-to-bottom. Open every slide-out (Name on a couple of tickers, Macro, Sector on a couple of sectors, Tape).
- Look for: console errors, `[object Object]`, `—` where data should exist, broken layout.
- Pick **5 random fields**. For each, trace dashboard → DB column → value. Mismatch = log.

### 2. User-journey walkthroughs (~30 min) — most valuable part

Three quick walks. Note any moments where the data feels wrong.

- **Walk 1**: Today → click name in Book → Name slide-out → Earnings summary.
- **Walk 2**: Macro strip → click regime → Macro slide-out → FOMC summary → Tape.
- **Walk 3**: Sector row → Sector slide-out → Implementation card.

The "feels wrong" moments are gold — analysts catch what engineers miss. Write them in `NOTES.md` even if you can't articulate why.

### 3. Cron + DB sanity (~15 min) — greps, not narration

Run these and report deltas only:

```bash
grep -L "DEPRECATED" workers/*/src/worker.js                # active workers
ls workers/*/wrangler.jsonc | xargs grep -l "crons"         # cron-enabled workers
wrangler d1 execute portfolio-db --remote --command \
  "SELECT 'macro' AS t, MAX(release_date) AS d FROM MACRO_STATE_indicators
   UNION SELECT 'sentiment', MAX(release_date) FROM SENTIMENT_STATE_indicators"
```

Any latest date >7 days old → log to `BUGS_FOUND.md`.

### 4. Schema doc reconciliation (~15 min)

Spot-check `docs/reference/DATABASE_SCHEMA.md` against three tables that changed in the recent sprints (e.g., `MACRO_STATE_indicators`, `SENTIMENT_STATE_indicators`, `FOMC_PROJECTIONS`). Doc differs from reality → fix the doc inline (trivial).

### 5. Bug log

For anything found that isn't a 1-line fix:

```
## {short title}
**Severity**: Low / Med / High
**Repro**: 1–2 lines
**Why deferred**: too big for this sprint / needs design / not blocking
```

### 6. Doc lifecycle (~10 min, end of sprint)

Move shipped sprint files to `archive/sprints/`:
```bash
git mv docs/active/SPRINT_2026-05-04_dashboard_balance.md docs/archive/sprints/
git mv docs/active/SPRINT_pipeline_implementation.md docs/archive/sprints/
git mv docs/active/SPRINT_pipeline_leftovers.md docs/archive/sprints/
git mv docs/active/SPRINT_agent_foundation.md docs/archive/sprints/
git mv docs/active/SPRINT_agent_rollout.md docs/archive/sprints/
```
Then update `docs/INDEX.md` links. One commit.

## Stop and ask

- If you find a High-severity bug (data displayed is materially wrong): log AND notify before continuing.
- If the smoke test fails on basic render: stop — agent rollout may have shipped broken.

## Done when

- `BUGS_FOUND.md` exists (can be empty).
- Trivial fixes committed.
- Shipped sprint files archived, INDEX updated.

## Out of scope

- New features.
- Refactors / "better organization".
- Performance optimization (log to BUGS_FOUND, defer).
- Schema redesign.
- Prompt re-tuning.

---

> [INDEX](../INDEX.md)
