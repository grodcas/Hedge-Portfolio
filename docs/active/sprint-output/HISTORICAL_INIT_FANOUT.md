# HISTORICAL_INIT_FANOUT · deferred initialization scope

**Captured**: 2026-05-05
**Why this exists**: MS-4a / MS-4b scoped initialization to the 3-ticker × 3-sector + macro slice
(NVDA / UNH / XOM + Technology / Healthcare / Energy). The dashboard is live for that slice;
every other entity surfaces a clean 404 in its slide-out. This file lists the work needed to
extend coverage to the full book — to be picked up *after* MS-5 validation + cleanup.

Each block ends with a Done-when so a future runner can resume without re-deriving the spec.

---

## A. Ticker fan-out — 22 tickers remaining

**Source of truth**: `config/peers-mapping.json` (25 tickers total).
**Already initialized**: NVDA, UNH, XOM.

**Outstanding 22:**
AAPL · MSFT · GOOGL · AMZN · META · TSLA · BRK.B · JPM · GS · BAC · CVX · LLY · JNJ ·
PG · KO · HD · CAT · BA · INTC · AMD · NFLX · MS

**Per ticker**: 11 agents fire in DAG order via the orchestrator
(`?ticker=<TKR>&force=1`):

1. valuation
2. fundamentals
3. estimates
4. peers
5. context
6. news-drift
7. thesis
8. notes
9. recommendation
10. read
11. earnings-summary (cached per quarter — needs a one-time fire to seed)

**Estimated cost**: ~11 calls × 22 tickers ≈ **240 LLM calls**. Per the credit-budget memory,
batch this as a single deliberate spend, not exploratory re-runs.

**Known data-coverage caveat (will repeat across the fan-out)**:
`ticker-peers` errored on UNH because UNH's healthcare peers
(`ELV / HUM / CNC / MOH / HQY / ALHC / PGNY / CLOV / PFHO / MRDH`) have no rows in
`STOCK_FACTORS_daily` / `FUND_01_Fundamentals`. The factor-ingestion pipeline today only
covers the 25-name book + cross-asset tickers. Same failure will hit any ticker whose peer
set sits outside the book — likely **most non-portfolio peers in every sector**.

**Decision deferred** (per INIT_NOTES_MS-4a flag): either
- (a) broaden `STOCK_FACTORS_daily` / `FUND_01_Fundamentals` ingestion to cover the full
  peer universe across all sectors, OR
- (b) loosen `ticker-peers-agent` to write `(insufficient peer coverage)` instead of
  erroring.

Pick the path before fan-out, otherwise ~half the peers cards will land in ERROR state.

**Done when**:
- All 25 tickers have non-null `valuation_json`, `fundamentals_json`, `estimates_json`,
  `peers_json` (or annotated coverage gap), `context_json`, `news_drift_json`,
  `thesis_json`, `notes_json`, `recommendation_json`, `read_json`, `earnings_summary_json`
  in `TICKER_TREND_long`.
- Each ticker's slide-out renders all 11 cards in the v2-balanced UI without a `—` or
  `[object Object]`.

---

## B. Sector fan-out — outstanding sectors

**Source of truth**: distinct `sector` values in `config/peers-mapping.json`.
**Already initialized**: Technology, Health Care, Energy.

**Outstanding sectors (11)**:
Media · Retail · Semiconductors · Automobiles · Financial Services · Banking ·
Pharmaceuticals · Consumer products · Beverages · Machinery · Aerospace & Defense

> The runbook originally said "8 sectors" — the peers-mapping has 14. Reconcile against
> whatever `SECTOR_TREND_long` accepts as a `sector` value before firing (some of these
> may be merged or aliased server-side). One-shot SQL: `SELECT DISTINCT sector FROM
> SECTOR_TREND_long` to see what the table actually expects.

**Per sector**: 6 agents fire (`?sector=<NAME>&force=1`):

1. news-drift (S1)
2. thesis (S2)
3. notes (S3)
4. implementation (S4)
5. hedges (S5)
6. read (S6)

**Estimated cost**: ~6 × 11 ≈ **66 LLM calls** (worst case before sector-name
reconciliation).

**Done when**:
- Each remaining sector has all 6 `*_json` columns populated in `SECTOR_TREND_long`.
- Each sector slide-out renders all 6 cards in v2-balanced.

---

## C. Tape annotations — daily refresh

**Currently populated**: 2026-04-14, 6 movers (`MOVER_EXPLANATIONS_daily.annotation_json`).
**Status**: stale by ~3 weeks as of 2026-05-05.

This isn't a one-time backfill — `tape-annotation-agent` is supposed to fire daily as
part of the orchestrator's market-hours loop. The single seeded day was a smoke-test
artifact. Once the hedge-server pipeline cron is firing reliably, tape annotations
should accumulate automatically (one fire per trading day, 5–8 movers per day).

**Done when**:
- Today's row exists in `MOVER_EXPLANATIONS_daily` with valid `annotation_json` for the
  day's top movers.
- Verify by ssh'ing hedge-server and checking the row landed after the daily 07:00 cron
  ran (or manual `?date=<TODAY>&force=1` fire).

---

## D. Historical-window dependencies

These aren't agent fan-out — they're data-layer prerequisites where computed fields can't
be honest until enough history accumulates. Track them so we know which numbers are
trustworthy when.

### D.1 · `MACRO_STATE_indicators.z_vs_24m`

- New FRED codes from MS-1b (`HOUST`, `INDPRO`, `JTSJOL`, `IPN213111S` or rig-count
  proxy) need 24 months of prior rows to make `z_vs_24m` meaningful. The MS-1b worker
  computes the Z on insert via D1 sub-query — if the underlying history isn't there,
  the field will be null or noisy.
- **Action when picked up**: after fan-out, sample-check
  `SELECT indicator_code, COUNT(*), MIN(release_date), MAX(release_date)
   FROM MACRO_STATE_indicators GROUP BY indicator_code` for the four new codes.
  Anything with < 24 monthly observations should be flagged as "Z-score not yet
  reliable" in the macro panel (or the agent prompt should hedge accordingly).

### D.2 · `FUND_03_Estimates.eps_revisions_30d` / `rev_revisions_30d`

- `consensus-fetcher` writes today's snapshot only. Revision deltas need 30 prior daily
  rows of estimates per ticker. First 30 days post-deploy will show null revisions →
  `ticker-estimates-agent` will produce hedged verdicts during that window.
- **Action**: no work needed — just wait. Optionally, document on the dashboard that the
  revisions field is in a warm-up window until the daily rows accumulate.

### D.3 · `TOPIC_FEED.days_active`

- MS-1d clusters over a 14d `BETA_12_News_digest` window. `days_active` (the persistence
  counter the dashboard relies on for "this topic has been live for N days") is only
  honest once we have 14 calendar days of cron-collected news rows.
- **Action when picked up**: `SELECT MIN(date), MAX(date), COUNT(DISTINCT date)
  FROM BETA_12_News_digest` — if the date span is < 14 days, the topic-feed verdict
  is partial. Note in BUGS_FOUND.md if it's still partial at MS-5a time.

---

## E. Earnings-summary cache — one-time per ticker

`ticker-earnings-summary-agent` is event-driven (per-quarter cached). For each ticker,
the most-recent reported quarter needs a one-time baseline fire — otherwise the
"Earnings summary" card 404s until the *next* print, which could be up to 13 weeks
away.

NVDA / UNH / XOM are seeded. The remaining 22 each need exactly one fire targeting their
last reported quarter. Fold this into the per-ticker DAG in §A — the orchestrator already
includes earnings-summary in the 11-agent list, so a `?ticker=<TKR>&force=1` will pick it
up.

**Done when**: every ticker has at least one row in the earnings-summary cache for its
most recent reported quarter.

---

## F. Suggested execution order when picking this back up

1. **Decide the peers-coverage path** (A, broaden ingestion vs. annotate gap). Without
   this, half the fan-out lands in ERROR.
2. **Reconcile sector names** between `peers-mapping.json` and `SECTOR_TREND_long`.
3. Fire the 22 tickers in one batch via orchestrator `?ticker=<TKR>&force=1`.
   ~240 LLM calls. Watch the firing log for any non-flag errors.
4. Fire the remaining sectors in one batch. ~66 LLM calls.
5. Browser walkthrough — open every slide-out top to bottom, log feels-wrong moments to
   `BUGS_FOUND.md` (the MS-5a artifact).
6. Update `INIT_NOTES_MS-4b.md` with final lights-on table covering the full book.

---

## G. Known follow-ups carried from VALIDATION_REPORT.md §0.4

These don't block fan-out but should be cleared before a v1.0 tag:

- FOMC SEP parser regex broken (column-group vs row-label).
- NAAIM CSV path 404 — alternative source TBD.
- ISM URLs 404 after April 2026 site reorg — drop or relocate.
- CBOE SKEW blocked by Cloudflare egress IP — needs `/ingest/skew` endpoint to push
  from the local pipeline.
- `ticker-peers:UNH` — see §A coverage caveat.
- `ticker-notes:NVDA` — transient empty-bullets validator reject; consider treating
  empty as a wrote-empty success state.
