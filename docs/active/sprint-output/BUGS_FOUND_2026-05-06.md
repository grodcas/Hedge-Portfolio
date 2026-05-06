# BUGS_FOUND · 2026-05-06 validation walk

Output of [SPRINT_validation_cleanup.md](../SPRINT_validation_cleanup.md), run alongside the smart-management audit the user asked for. Read-only walk; nothing here was fixed inline. Logged for follow-up.

---

## #1 SENTIMENT_STATE_indicators latest release_date is in the future

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

**Fix sketch**: inspect `workers/sentiment-state-fetcher/src/worker.js` for the date-construction step around AAII; compare against a known-good reference (the value rows came from somewhere reasonable, the date scoping is the issue).

---

## #2 TOPIC_FEED.date_last_seen is 11 days stale

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

**Fix sketch**: tail topic-feed-builder logs (`wrangler tail topic-feed-builder`) for the last few cron runs. Three likely culprits: (a) upstream news ingest stopped writing rows after 04-25, (b) the canonicalisation step is matching new news items against old topic strings and bumping wrong rows, (c) the cron firing but bailing inside an idempotency check that shouldn't apply here.

---

## #3 ✅ Smart-management audit — confirmed solid

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

## #4 ✅ EDGAR-confirmation trigger added to consensus-fetcher

(Not a bug — same-session improvement that this validation pass surfaced.)

`consensus-fetcher`'s gate now reads `MAX(last_10q_filing_date)` per ticker from `FUND_01_Fundamentals` and fires AV consensus refresh when the SEC-confirmed filing date is newer than our last `FUND_03_Estimates` write. This closes the "calendar said earnings would land 2026-05-15 but they actually filed 2026-05-13" gap — analysts are revising on the actual print, so consensus refresh becomes signal-rich exactly when the EDGAR confirmation lands.

Old gate: `inWindow || tooStale`
New gate: `inWindow || tooStale || newFiling`
