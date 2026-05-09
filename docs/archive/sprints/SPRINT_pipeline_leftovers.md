> [INDEX](../INDEX.md)

# SPRINT · Pipeline-implementation leftovers

**Model**: Sonnet 4.6 · **Effort**: ~1.5h · **Output**: clean working tree, optional 5-line `NOTES.md` if any decision needs surfacing.

## Goal

Close the 5 known follow-ups from the pipeline-implementation sprint. Get the working tree to a state where future sprints don't inherit half-done work.

## Items (do in this order)

1. **Per-parser commits.** Working tree currently has ~20 uncommitted files spanning two sprints. Split into discrete commits (one logical unit per commit), at minimum:
   - migrations 0035–0041 (one commit, they ship together)
   - each new worker (`yfinance-cross-asset-fetcher`, `sentiment-state-fetcher`, `ism-fetcher`, `naaim-fetcher`) — one commit each
   - extended workers (`macro-state-fetcher`, `fomc-statement-fetcher`, `portfolio-ingestor`) — one commit each
   - doc updates (DATABASE_SCHEMA, INDEX, sprint-output/, v2_BALANCED_MOCKUP) — one commit
   - dashboard mockup v2-balanced — one commit
   - DEPRECATED `getGammaRegime_ETF` in `macro/scraper.js` — one commit
   - `fetch-fundamentals.js` quarterly extension — one commit

2. **FOMC SEP parser fix.** `workers/fomc-statement-fetcher/src/worker.js` has a regex that assumes year-as-row, stat-as-column. Actual table is the inverse: Median / Central Tendency / Range as colspan-4 column-groups, year sub-columns inside each, indicators as rows. Fix the regex; test with `/projections?meeting=2026-03-19`. Hard ceiling: **30 min**. If it overflows, write 3 lines in NOTES.md and move on.

3. **NAAIM**: try `https://www.naaim.org/feed/` (RSS) first. If that doesn't carry the exposure index, drop the worker per soft-delete protocol (DEPRECATED header + comment cron line). Hard ceiling: **20 min**.

4. **ISM**: search for one alternate URL pattern (try `https://www.ismworld.org/news-and-publications/reports/`). If 404s persist, drop both `ISM_MFG` and `ISM_SVC` per soft-delete protocol. Hard ceiling: **20 min**.

5. **Auto-fill `VALIDATION_REPORT.md` "Value written" column.** One SQL query per indicator code reads the latest D1 value. Write a small bash script using `wrangler d1 execute --remote` that emits the populated table. User compares to source URL manually later.

## Rules

- Every change committed before starting the next item.
- Soft-delete only for NAAIM/ISM if dropping (no `git rm`).
- If item 2 overflows or item 3/4 needs more than the ceiling, **stop** and report — don't burrow.

## Done when

- `git status` is clean.
- FOMC parser produces non-empty rows on the test call OR is documented in NOTES.md as deferred with reason.
- NAAIM and ISM are either working or DEPRECATED (no in-between state).
- VALIDATION_REPORT.md has populated value columns.

## Out of scope

- CBOE SKEW wiring (separate follow-up).
- Backfill of any historical data.
- Re-running validation against source URLs (user does that).

---

> [INDEX](../INDEX.md) · [Pipeline impl sprint](SPRINT_pipeline_implementation.md)
