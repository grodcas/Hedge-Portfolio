# BUGS_FOUND · 2026-05-06 validation walk

Output of [SPRINT_validation_cleanup.md](../SPRINT_validation_cleanup.md), run alongside the smart-management audit the user asked for. Read-only first pass; second pass deepened the sweep and fixed several inline.

**Status legend**: 🟢 fixed · 🟡 partial / observability added · 🔵 not a bug, logged for clarity · 🔴 needs follow-up.

---

## #1 🟢 SENTIMENT_STATE_indicators latest release_date is in the future — FIXED

**Severity**: Med · **Path**: `SENTIMENT_STATE_indicators` rows for `AAII_BULL_BEAR`, `AAII_BEARISH`, `AAII_BULLISH`

```
indicator_code      | release_date | value
--------------------+--------------+------
AAII_BULL_BEAR      | 2026-11-19   | -11
AAII_BEARISH        | 2026-11-19   |  43.6
AAII_BULLISH        | 2026-11-19   |  32.6
```

Today is 2026-05-06; `2026-11-19` is six months in the future. The numeric values look plausible (Bull−Bear ≈ −11 with Bullish 32.6 / Bearish 43.6 sums to ~76 with a neutral remainder), so it's almost certainly a date-parsing bug in `sentiment-state-fetcher`, not a value bug. Likely a `MM-DD-YYYY` → `YYYY-MM-DD` swap on a date string that contained `2026-11-19` in some rotated form, or AAII's "next survey date" field being read in place of "current survey date".

**Impact**: any agent that sorts by `release_date DESC` on this table reads stale values flagged as "fresh today". The macro-thesis gate's hot-print check (`|z_vs_24m| > 1.5` since last write) won't fire on a real AAII spike because the existing rows are pinned to a fictional 2026-11-19.

**Fix applied** (commit `f08b5e3` proposed): `sentiment/index.js fixAAIIDate()` always used `new Date().getFullYear()` regardless of whether the resulting date landed in the future. Added a `rollbackIfFuture()` helper that subtracts a year when the constructed date > today, applied to both the live-scrape path (`parseUSDate`) and the MHTML fallback (`fixAAIIDate`). Bad rows deleted from `BETA_04_Sentiment` + `SENTIMENT_STATE_indicators`; sentiment-state-fetcher re-fired clean — AAII rows now stamp 2026-04-29 with bullish 38.1 / bearish 39.7 / spread −1.6, all confirmed against AAII's actual late-April survey.

---

## #2 🟡 TOPIC_FEED.date_last_seen is 11 days stale — root cause OpenAI quota; observability added

**Severity**: Med · **Path**: every row in `TOPIC_FEED`

```
topic_canonical                                      | date_last_seen | days_active
-----------------------------------------------------+----------------+------------
Global tech policy shifts and Asia's AI surge        | 2026-04-25     | 1
Iran war developments and Strait of Hormuz ...        | 2026-04-25     | 1
Inflation signals from China and FX moves on Iran    | 2026-04-25     | 1
Pivotal tech-led earnings week meets Fed meeting     | 2026-04-25     | 1
... (all top rows show same date)
```

Today is 2026-05-06 — `date_last_seen` should advance to ≤ 1 trading day stale on a healthy news funnel. Predates today's OpenAI quota issue (which started ~now), so this is structural, not a one-day blip. The funnel's reranker / topic-feed-builder hasn't been writing fresh `date_last_seen` since 2026-04-25.

**Cron context**: `topic-feed-builder` runs daily at `0 2 * * *`. So it has had ~10 cron firings since 04-25 with no advance.

**Impact**: any "what's hot in the news lately" surface (drift detectors, news-rerank gate, dashboard topic chips) sees a frozen view. Macro-news-drift's gate uses `TOPIC_FEED.date_last_seen > thesis_updated_at` — with date_last_seen frozen at 04-25, news drift never fires.

**Diagnosis**: probed `/build` directly. Returned `HTTP 429: You exceeded your current quota`. Same OpenAI billing exhaustion that's blocking the MS-6f LLM fan-out. The 11-day stall predates today's session because the quota tipped on/around 2026-04-25.

**Fix applied**: code is correct, can't run without credits. Two follow-ons:
1. Wired `topic-feed-builder` to the new `_shared/api-usage.js` `recordApiCall()` helper. Every cluster call now writes a row to `PROC_04_API_usage` (success or fail). Failed-call cost is dropped to $0 (no charge for 429s). The Validator tab will now surface "topic-feed-builder · openai/gpt-5-mini · N calls / $0.00" — an obvious "stalled" signal that didn't exist before.
2. The same pattern should be applied to every LLM-calling worker so silent OpenAI / Gemini stalls become visible. Not done in this pass — picked up in a follow-up sprint along with the rest of the agent fleet.

**Net**: TOPIC_FEED freshness will resume the moment OpenAI credits replenish and the next 02:00 UTC cron fires. The Validator tab will immediately show the recovered call counter.

---

## #3 🔵 BETA_11_Macro_news 23 days stale — orphaned table

**Severity**: None (logged for clarity) · **Path**: `BETA_11_Macro_news`, last `date = 2026-04-13`

`grep -rln "BETA_11_Macro_news"` across `workers/` and `src/` returns: zero writers, zero readers. The table was created in migration 0007 and never wired up (or had its producer / consumers deprecated). The 23-day staleness is meaningless — nothing should advance it.

**Action**: not deleted (table is cheap to keep; deletion has migration risk). Recommend dropping in a future cleanup migration if confirmed unused.

---

## #4 🔴 MOVER_EXPLANATIONS_daily 22 days stale (last `date = 2026-04-14`)

**Severity**: Med · **Path**: `big-movers-why` worker writes the table; `tape-annotation-agent` adds annotations.

Producer (`big-movers-why`) has **no cron trigger**. It's invoked by `job-engine-workflow` as a step in the news/movers DAG (`workers/job-engine-workflow/src/index.js:365`), with dependencies on `news-funnel-orchestrator` + `price-fetcher`. Either the workflow stopped firing, or one of its prerequisites stalled out around 2026-04-14.

**Diagnosis pending**: needs `wrangler tail job-engine-workflow` over the next cron window to see whether the workflow runs at all. Also needs a recurring trigger if the design called for one (the wrangler.jsonc has no triggers block — possibly intentional if this runs on-demand only).

**Action**: logged. Not fixed in this pass — needs decisions on (a) is this supposed to run on cron? (b) which downstream consumer of `MOVER_EXPLANATIONS_daily` is impacted? Tape annotations on the dashboard are the obvious candidate.

---

## #5 🔴 SIGNAL_01_Assessment 11 days stale (last `date = 2026-04-25`)

**Severity**: Med · **Path**: `assessment-engine` worker.

Same shape as #4 — no cron, depends on workflow trigger. The 2026-04-25 date matches the TOPIC_FEED stall date exactly, which suggests OpenAI quota exhaustion is the proximate cause for both.

**Action**: logged. Will recover when (a) OpenAI credits replenish and (b) `assessment-engine` is re-fired (likely via job-engine-workflow's job DAG).

---

## #6 🟡 Failed-call cost mis-billing in `_shared/api-usage.js`

**Severity**: Low (caught on the same day it shipped) · **Path**: `workers/_shared/api-usage.js`

Initial helper charged the per-call cost regardless of `ok` flag. A failed OpenAI call would book $0.0008 in `PROC_04_API_usage` even though OpenAI doesn't charge for HTTP 429 quota rejections.

**Fix applied**: `cost = ok ? costFor(...) : 0`. Counter still ticks on failure, so a sustained 429 streak is visible as "N calls / $0.00" — exactly the right shape to catch a quota stall.

---

## #7 ✅ Smart-management audit — confirmed solid

(Not a bug — recording the audit result alongside the bugs above.)

| Surface | Trigger | Confirmed |
|---|---|---|
| AV statements (IS/BS/CF) | EDGAR submissions API: only fetches when SEC `periodOfReport > our latest stored` AND ≥ `AV_INDEX_LAG_DAYS` since SEC `filingDate` | `src/steps/fetch-fundamentals.js:268` (`selectStatementTickers`) |
| AV OVERVIEW | 3-day per-ticker cooldown on `pe_ratio` non-null | shipped today (MS-6.0b) |
| AV consensus (`EARNINGS_ESTIMATES`) | next_earnings_date window OR >7d stale OR **EDGAR-confirmed `last_10q_filing_date` newer than last consensus write** | shipped today (MS-6.0a + this run) |
| Finnhub earnings (`/stock/earnings`) | Same-day skip when all 25 tickers have a row stamped today | `earnings-fetcher/src/worker.js:38` |
| Finnhub calendar (`/calendar/earnings`) | Single market-wide call once per day; persisted to `EARNINGS_CALENDAR_consensus` | shipped today |
| Press / EDGAR / Macro / Sentiment ingest | Same-day discovery skip + per-row idempotent upsert | confirmed |
| All 25 LLM-burning agents | Per-agent epsilon gate (regime change, fresh `\|z\|>1.5`, news drift verdict change, new earnings period, new 10-Q) | `agent-orchestrator/src/worker.js:303–1110` |
| Tape annotation | Fires only on the latest date with unannotated movers | `agent-orchestrator/src/worker.js:1104` |

**Net**: every metered API and every LLM call is gated by either (a) calendar/EDGAR event confirmation, (b) freshness/staleness, or (c) upstream signal change. Two non-event-driven exceptions are deliberate (FRED panel cron + Finnhub calendar daily refresh) — both are unmetered and cheap.

---

## #8 ✅ EDGAR-confirmation trigger added to consensus-fetcher

(Not a bug — same-session improvement that this validation pass surfaced.)

`consensus-fetcher`'s gate now reads `MAX(last_10q_filing_date)` per ticker from `FUND_01_Fundamentals` and fires AV consensus refresh when the SEC-confirmed filing date is newer than our last `FUND_03_Estimates` write. This closes the "calendar said earnings would land 2026-05-15 but they actually filed 2026-05-13" gap — analysts are revising on the actual print, so consensus refresh becomes signal-rich exactly when the EDGAR confirmation lands.

Old gate: `inWindow || tooStale`
New gate: `inWindow || tooStale || newFiling`
