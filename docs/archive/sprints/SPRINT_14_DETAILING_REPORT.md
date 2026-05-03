# Sprint 14 — Final Detailing Report

**Scope:** review-only polish pass across the entire codebase after Sprints 8–12.
No architectural changes. Small fixes applied inline; larger items and
conceptual failures are documented at the end for a dedicated look.

Generated 2026-04-23.

---

## 1. Inline fixes applied

### 1.1 Sprint 13.1 — assessment-engine silent ingest failure (RESOLVED)

`workers/assessment-engine/src/worker.js:391` was posting computed assessments
to `portfolio-ingestor` over public HTTPS. Cloudflare's same-account
worker-to-worker public fetch triggers error 1042 (loop detection) silently —
`res.ok` returns false, no exception is thrown, the `if (res.ok)` block skips
the success log, nothing lands in D1, and the top-level `Response.json({ok:
true, tickers: 25})` is still returned. Result: `SIGNAL_01_Assessment` had
not ingested since 2026-04-15 (8 days of silent loss).

`stock-factor-builder/src/worker.js:59-60` documents this exact failure mode
and works around it with a direct D1 binding. assessment-engine now mirrors
that pattern: replaced the `fetch(INGESTOR_URL)` POST with a direct
`env.DB.prepare(INSERT...ON CONFLICT...)` loop. Dropped the now-unused
`INGESTOR_URL` constant. Added a `rowIdHash` helper aligned with the
ingestor's existing id convention (full 64-char SHA-256 hex on
`"ticker|assessment|date"`) so rows written directly here collide with
ingestor-routed rows on the same key.

**Verified:** `/compute-assessments` now writes 25/25 rows for today.
Factor 8 `Macro alignment` from Sprint 8's `sector_tilt` wiring is visible
in `factors_json` for all tickers.

### 1.2 Sprint 13.3 — OPERATION_01_Signals Industrial write race (RESOLVED)

Sprint 8 left two active Industrial rows in `OPERATION_01_Signals` from a
write race between the `/build-all` loop and an ad-hoc `/build?sector=
Industrial`. Set the older row's `superseded_by` to the newer row's id.
Verified: exactly 1 active row per canonical sector (plus the historical
"Consumer" row preserved as-is per the Sprint 8 plan).

The underlying race is still there — if two ops-agent builds fire within
~3 seconds of each other, both can see `superseded_by IS NULL` on the same
previous row. The proper fix is an atomic D1 batch in
`operations-agent/src/worker.js:buildForSector` (deferred, see §3).

### 1.3 Audit-driven cleanups

Applied inline, all one-file changes:

| File | Change |
|---|---|
| `dashboard/portfolio-funnel-mockup.js:1764` | Deleted `_fmtMoney()` — added during Sprint 9, never called |
| `whitehouse/index.js` | Rewrote the debug-heavy logging: 30+ `[DEBUG]` lines → 4 meaningful `[WH]` lines. Same behavior, no noise |
| `workers/job-engine-workflow/wrangler.jsonc` | Added missing observability block; bumped `compatibility_date` from `2025-01-10` to `2026-01-07` (match peers) |
| `workers/bootstrap-workers.ps1` | Deleted — referenced 5 workers that no longer exist (`job-cron`, `macro-news-summarizer`, `news-orchestrator`, `news-summarizer`, `from48-summarizer`) |

### 1.4 Audit findings that were false positives

The audit surfaced claims I verified and rejected:

- **"OpenAI `/v1/responses` endpoint is wrong, should be `/v1/chat/completions`"**
  (flagged in 4 workers). This is the real OpenAI Responses API shipped in 2025
  — used intentionally with `model: "gpt-5.2"`. Not a bug.
- **"`gpt-4.1-mini` doesn't exist"** (flagged in `whitehouse/index.js:79`).
  Real model, released April 2025.
- **"`shortHash()` inconsistency across 15 workers"** — each worker uses a
  convention aligned with the id column of the table it writes to.
  Cross-worker divergence is not the same as within-worker inconsistency.
- **"report-orchestrator silent catch at `src/worker.js:103`"** — the
  `catch {}` is intentional: failed JSON parse means the structure is
  invalid, which triggers a structure-builder rebuild downstream. Correct
  control flow.

---

## 2. Verified-clean surfaces

Confirmed no remaining issues in these areas:

- **Sector naming** — 0 stale "Consumer" references outside the preserved
  historical `OPERATION_01_Signals` row. All 5 target workers on the
  canonical 8-sector map.
- **`macroBlob.catalysts`** — Sprint 11 removed it cleanly. 0 active reads.
- **Narrator dispatcher service bindings** — match the deployed worker names.
- **D1 migration numbering** — sequential 0003 through 0033, no gaps, no
  duplicates.
- **ENTITIES table in `portfolio-funnel-mockup.js`** — every entry is
  referenced from a render site; no orphans.

---

## 3. Deferred — small items (bugs/polish, not blocking)

Each is a <1-hour fix. Listed in rough priority order.

| # | Item | File(s) | Est |
|---|---|---|---|
| S1 | `OPERATION_01_Signals` write-race (Sprint 13.3 root cause) — wrap the INSERT + supersede-previous into an atomic D1 batch so concurrent writers can't both see `superseded_by IS NULL` | `workers/operations-agent/src/worker.js:buildForSector` | 30 min |
| S2 | Hardcoded public `INGESTOR_URL` in `price-fetcher`, `event-attribution-engine`, and a couple other workers. Move to `env.INGESTOR_URL` for consistency with the 13.1 DB-binding pattern, or better, switch those workers to direct DB binding too | 3–4 workers | 45 min each |
| S3 | `.env` has 5 provider keys that aren't imported anywhere: `FRED_KEY`, `BLS_KEY`, `BEA_KEY`, `NASDAQ_KEY`, `FMP_KEY`. Decide: delete, or document as "reserved for upcoming X" | `.env` | 5 min |
| S4 | `.env` has CRLF line endings. Caused one `source /Users/.../.env` error during Sprint 11. Convert to LF | `.env` | 2 min |
| S5 | `workers/schema/` — single file `PROC_04_Fact_verification.sql` that's neither a migration nor a runtime SQL asset. Either fold into `workers/portfolio-ingestor/migrations/` as a proper migration or delete | `workers/schema/PROC_04_Fact_verification.sql` | 5 min |
| S6 | Stale timing docs: `docs/TEST_RESULTS_20260410.md`, `docs/PIPELINE_TIMINGS_2026-04-12.md`. Either re-run and update, or move to `docs/archive/` | `docs/` | 10 min |
| S7 | Stale strategy docs: `docs/FULL_PIPELINE.md`, `docs/REWORK_PLAN.md`, `docs/STRUCTURE.md` were written before Sprints 1–12 and now contradict what shipped. Add a "SUPERSEDED BY NARRATIVE_PHASE_2_PLAN.md" banner, or move to `docs/archive/` | `docs/` | 10 min |
| S8 | `.gitignore` — 8 new artifacts created during Sprints 8–12 are untracked. Decide per directory: commit or ignore. Notably: `docs/NARRATIVE_*.md`, `docs/narrative/`, `workers/economic-calendar-fetcher/`, `workers/fomc-statement-fetcher/`, `workers/narrator/`, `workers/nav-builder/`, `workers/position-builder/`, `workers/probability-curve-builder/`, `workers/sector-factor-builder/`, `workers/sector-trend-*/`, `workers/stock-fact…/`, `workers/valuation-curve-builder/`, migrations 0022–0033. All of these are actively deployed and should be tracked | repo root | 15 min |
| S9 | `config/` and `scripts/` — new top-level directories untracked. Contents unknown from outside Sprints 8–12; check if they should be committed | repo root | 10 min |
| S10 | `package.json:devDependencies` is empty; all 15 deps are in `dependencies`. `puppeteer` in particular is a likely dev-only dep. Not blocking, but tidier to split | `package.json` | 5 min |

---

## 4. Deferred — medium items (reliability)

| # | Item | Est |
|---|---|---|
| M1 | Sprint 13.2: narrator-dispatcher `/cold-start` timeout. The 36-entity fan-out (1 regime + 3 landscapes + 8 sectors + 25 stocks) exceeds Cloudflare's request timeout. Either chunk into phases (`/cold-start/phase?=...`) or flip to queue-then-drain semantics. Documented in `NARRATIVE_PHASE_2_PLAN.md` | 1–2 h |
| M2 | Narrator-regime `identification` block doesn't cite WH or FOMC context despite Sprint 10 wiring both tables into the gather. The LLM prefers indicator-level facts (CPI, NFP, yields) and drops narrative context. Not a wiring bug — a prompt-tuning decision. Consider re-weighting the prompt to reserve 1 of 5 bullets for narrative context (WH or FOMC) | 30 min + observation |
| M3 | `valuation-curve-builder` currently runs Mode 1 (short) only via a cron sweep. Event-driven triggering via `narrator-dispatcher`'s service binding would make the short curve react within minutes of a news/press event rather than waiting up to 24 h | 1 h |
| M4 | Stock narrator's `rec_long` and `rec_short` don't yet cite the Sprint 12 valuation curves. When the curves have ≥ 1 week of history, wire them into the narrator prompts so `rec_long` explicitly references the gap ("long fair +4% above price, 47-day persistence") | 45 min |
| M5 | Calibration badge + validation-tab calibration plot deferred from Sprint 12 — requires ≥ 30 realized rows in `SIGNAL_03_ValuationRealized` before it's worth building. Put on the calendar for ~2026-05-20 when the first 21-day windows close at scale | 2 h |

---

## 5. Conceptual issues worth a dedicated look

These aren't polish items — they're design decisions or architectural debt
that are worth staring at with fresh eyes, not sneaking through in a
cleanup pass.

### 5.1 Silent-failure pattern across multiple workers

Sprint 13.1 exposed assessment-engine's version of this. The same pattern —
`try { const res = await fetch(INGESTOR_URL); if (res.ok) { log success; } }
catch { log failure; }` with no `else` branch for `!res.ok` — exists in:

- `workers/price-fetcher/src/worker.js` (hardcoded INGESTOR_URL, same pattern)
- Older workers in the quarterly-filings cluster
- Possibly others — a codebase-wide grep for `if (res.ok)` without a
  companion `else` is worth running

**Recommendation:** a codebase-wide rule — every `fetch()` for a cross-worker
write either (a) uses a direct D1 binding (preferred, per `stock-factor-
builder`), or (b) has a defensive `else` that logs the status and body.
`assessment-engine` has the template now.

### 5.2 Duplicated helper functions across workers

The audit found `shortHash`, `indexBy`, `callGPT5`, and the `SECTOR_MAP`
constants re-declared in 15+ workers with subtly different shapes (some
truncate the hash to 16 chars, others to 32, others full 64). This is a
cost each time:

- A bug fix in one copy doesn't propagate
- Refactoring the SECTOR_MAP (like Sprint 8) required editing 5 files
- New contributors can't tell which version is canonical

**Recommendation:** introduce `workers/shared/` with `hash.js`, `gpt.js`,
`sectors.js`, `indexBy.js`. Wrangler 4 supports ES-module imports across
workers in the same repo. A focused 2-hour refactor sprint.

### 5.3 SIGNAL_02 vs SIGNAL_03 (probability-engine vs valuation-curve-builder)

Sprint 12 explicitly kept `probability-engine` running in parallel with the
new `valuation-curve-builder` and said "decommission in a later cleanup
sprint." That sprint is ~30 days away (per Sprint 12 risks section). Flag:
**at some point after 2026-05-23, do the comparison and retire one of
them.** Two probability-ish models producing slightly different signals
will confuse the dashboard and the narrator prompts.

The `SIGNAL_02_Probability` table still has writes happening daily from
the old engine; those need to be stopped cleanly before the dashboard
stops reading it.

### 5.4 Narrator-dispatcher coverage and backpressure

The dispatcher was built in Sprint 7 to orchestrate narrator fan-outs on
events. In practice, today's system has **3 separate event orchestrators**:

- `narrator-dispatcher` — narrative rebuilds
- `valuation-curve-builder` cron — curves
- `report-orchestrator` — filings

None coordinate. If a 10-K lands, the filing is summarized by the report
chain, then independently the narrator refires after a dispatcher tick,
and independently the valuation-curve-builder picks it up on the next
cron. Three unrelated code paths respond to the same event.

**Recommendation:** long-term, one event bus (D1 `PROC_01_Job_queue` could
serve this — Sprint 7 already writes to it). Short-term, at least make
sure the three paths don't step on each other (they currently don't — but
that's luck, not design).

### 5.5 Event-stream history gap (from Sprint 12 design discussion)

The valuation-curve-builder's long curve charts will look sparse for
several months because:

- `BETA_12_News_digest` has ~3 weeks of history
- `ALPHA_03_Press` has ~3 weeks
- `BETA_02_WH` is now fresh (Sprint 10) but historical content gone
- `MACRO_STATE_fomc` is now historically populated (Sprint 10)
- `FUND_02_Earnings` has 4 quarters
- SEC filings have a full year

User already accepted this. Worth noting that the dashboard's eventual
"curve-leads-price" narrative will only become compelling after ~6 months
of operation. Don't over-polish the calibration badge before there's real
data.

### 5.6 Sprint 13.1 (now fixed) suggests a monitoring gap

The silent ingest failure ran for 8 days before Sprint 8 verification
caught it. **There is no daily sanity check** for "did today's pipeline
produce the row counts we expected?" A trivial D1 cron that writes to a
`PROC_02_Daily_sanity` table and surfaces on the dashboard Validation tab
would have caught this in ~1 day.

**Recommendation:** a 1-hour sprint to add a daily-sanity worker:
- Every day at 02:00 UTC, query rowcounts for `SIGNAL_01`, `STOCK_FACTORS_daily`,
  `SECTOR_FACTORS_daily`, `TICKER_TREND_long`, `OPERATION_01_Signals`,
  `SIGNAL_03_ValuationCurve_long`, `BETA_02_WH`, `MACRO_STATE_fomc`, etc.
- Compare to expected (25 tickers, 8 sectors, 1 macro blob, etc.)
- Write a row; alert if any count is zero.

---

## 6. Summary

| Category | Count |
|---|---|
| Inline fixes applied | 6 (Sprint 13.1 + 13.3 + 4 polish items) |
| False positives rejected | 4 |
| Deferred small items | 10 |
| Deferred medium items | 5 |
| Conceptual issues for review | 6 |

**State of the system after this sprint:** Sprint 8–12 deliverables all
shipped. Core is solid. The 10 small deferred items are genuine polish,
not blockers. The 5 medium items are next-90-days work. The 6 conceptual
issues are worth a 30-minute discussion each.
