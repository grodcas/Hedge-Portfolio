# SPRINT · Historical Initialization · 2026-05-06

> **Prereq**: [SPRINT_2026-05-06_pre_init_api_audit.md](SPRINT_2026-05-06_pre_init_api_audit.md) ships first.
> Without that, MS-6d will 403 on Alpha Vantage — `fetch-fundamentals` and `consensus-fetcher` share one 25/day budget.
>
> Picks up the deferred scope from [HISTORICAL_INIT_FANOUT.md](sprint-output/HISTORICAL_INIT_FANOUT.md).
> Goal: every dashboard cell has a non-empty value the user can read by end of day.

**Effort**: ~5h · **Output**: 25 tickers + all sectors + macro all populated; INIT_NOTES_MS-6.md.

## Pre-flight — data-source verification (done 2026-05-05)

| Source | Endpoint | Status | Notes |
|---|---|---|---|
| FRED | `/fred/series/observations` | ✅ | 24mo+ history available for HOUST/INDPRO/JTSJOL/IPN213111S |
| Yahoo Finance (direct) | `/v8/finance/chart/{ticker}?range=2y` | ✅ | No key, no apparent rate limit, 2y daily prices in one call → STOCK_FACTORS_daily backfill |
| Polygon | `/vX/reference/financials` | ✅ | Free-tier financials work → FUND_01_Fundamentals backfill |
| Polygon | `/v2/aggs` for >2y prices | ❌ 403 | "plan doesn't include this timeframe" — Yahoo covers this gap |
| Alpha Vantage | `EARNINGS_ESTIMATES` | ✅ | Returns 7d/30d/60d/90d revision deltas IN ONE CALL — eliminates 30-day organic wait |
| Alpha Vantage | rate limit | ⚠️ | Free tier = **25 req/day total**. Plan AV calls within budget |
| Finnhub | `/stock/eps-estimate` | ❌ 403 | Tier doesn't include — replaced by AV |
| FMP | `/api/v3/analyst-estimates` | ❌ 403 | Legacy endpoint deprecated post-Aug 2025 |

**Key finding**: AV's `EARNINGS_ESTIMATES` already exposes 7d/30d/60d/90d revision deltas, so `FUND_03_Estimates.eps_revisions_30d` and `rev_revisions_30d` are populatable on day 0 — **no 30-day organic wait needed**. Worth a small detour (MS-6e) to swap `consensus-fetcher` from Finnhub to AV.

## Locked defaults

- Hosting: hedge-server (everything runs from there or laptop, all writes via Cloudflare workers / D1).
- AV budget: 25 calls/day. Plan: 25 EARNINGS_ESTIMATES calls Day 1; spill anything over to Day 2.
- Peer-coverage decision (the UNH-peers flag): **option B — annotate gap**. `ticker-peers-agent` writes `(insufficient peer coverage)` instead of erroring when peer factor rows are absent. Keeps the cards rendering. Broadening factor ingestion to the full peer universe is a separate, larger sprint.
- Models for fan-out: gpt-5 keystone agents, gpt-5-mini classifiers — same as SPRINT_CHAIN.

---

## MS-6a · MACRO_STATE Z-scores sanity (~10 min)

**Why first**: cheap, validates that the new codes from MS-1b actually have 24mo of computed Z-scores before agents read them.

Steps:
1. Query D1: `SELECT indicator_code, COUNT(*), MIN(release_date), MAX(release_date) FROM MACRO_STATE_indicators WHERE indicator_code IN ('HOUST','INDPRO','JTSJOL','IPN213111S') GROUP BY indicator_code`.
2. If any code has < 24 monthly rows → fire `macro-state-fetcher` `/build` once with `?backfill=24m` (extend the fetcher if not implemented; it's a one-line FRED `observation_start` change).
3. Spot-check `z_vs_24m` is non-null on the latest row for each code.

**Done when**: 4 codes × ≥24 monthly rows × non-null Z-score.

---

## MS-6b · STOCK_FACTORS_daily 2y backfill via Yahoo (~30 min)

**Why**: powers per-ticker valuation/peers context. Today only the 25 portfolio names have rows — peers (UNH→ELV/HUM/CNC/…) are missing, which is what made `ticker-peers:UNH` fail in MS-4a.

Steps:
1. Build `scripts/backfill-stock-factors.js`: for each ticker in `[portfolio ∪ all peers]`, call `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=2y&interval=1d`, transform to STOCK_FACTORS_daily rows, POST to `portfolio-ingestor /ingest/stock-factors-bulk`.
2. New endpoint `/ingest/stock-factors-bulk` on portfolio-ingestor: bulk insert with `INSERT OR IGNORE` so re-runs are idempotent.
3. Run with concurrency 5; log per-ticker rows-inserted.

**Done when**: `SELECT ticker, COUNT(*) FROM STOCK_FACTORS_daily GROUP BY ticker` shows ≥ 400 rows for every portfolio + peer ticker.

**Skip the broad peer fan-out if the user defers**: per locked default, `ticker-peers-agent` will annotate the gap. In that case backfill only the 25 portfolio names (~5 min).

---

## MS-6c · FUND_01_Fundamentals backfill via Polygon (~30 min)

**Why**: fundamentals card needs ≥4 quarters of history for the "expanding/holding/contracting" verdict.

Steps:
1. Build `scripts/backfill-fundamentals.js`: per ticker, call Polygon `/vX/reference/financials?ticker=X&limit=8&timeframe=quarterly` (last 8 quarters), transform, POST to existing `/ingest/fundamentals-quarterly`.
2. Polygon free tier rate: ~5/sec. 25 tickers = 5 sec. Add the 100+ peer tickers if MS-6b chose the broad path.
3. Idempotent via existing `(ticker, fiscal_period)` unique constraint.

**Done when**: every portfolio ticker has 8 quarterly rows in FUND_01.

---

## MS-6d · Switch consensus-fetcher to AV `EARNINGS_ESTIMATES` (~45 min)

**Why**: Finnhub returns 403; AV gives revisions deltas in one call.

Steps:
1. Edit `workers/consensus-fetcher/src/worker.js`: replace Finnhub call with `https://www.alphavantage.co/query?function=EARNINGS_ESTIMATES&symbol={ticker}&apikey=...`.
2. Map AV fields:
   - `eps_estimate_average` → `eps_consensus`
   - `eps_estimate_average` − `eps_estimate_average_30_days_ago` → `eps_revisions_30d`
   - `eps_estimate_high` − `eps_estimate_low` → `eps_dispersion`
   - `eps_estimate_analyst_count` → analyst count (new column? or skip)
   - Same for revenue side.
3. **Throttle**: 1 req/sec to stay inside the 25/day soft limit (the limit is per-day, but bursts get blocked).
4. Deploy. Fire `/build` for each of the 25 portfolio tickers. Cap: 25 AV calls.

**Done when**: every portfolio ticker has FY/FY+1/FY+2 rows in `FUND_03_Estimates` with non-null `eps_revisions_30d`.

---

## MS-6e · Patch `ticker-peers-agent` for graceful gaps (~15 min)

**Why**: per locked default. UNH and any non-portfolio peer set will fail otherwise.

Steps:
1. Edit `workers/ticker-peers-agent/src/worker.js`: when `comp rows found = 0`, instead of throwing, write a peers JSON with `relative_position: "n/a"`, `premium_status: "insufficient peer coverage"`, `as_of: today`, and a note string the slide-out can render.
2. Deploy.

**Done when**: a re-fire on UNH writes the annotated JSON instead of erroring.

---

## MS-6f · Ticker fan-out — 22 remaining (~1.5h, ~240 LLM calls)

**Tickers**: AAPL · MSFT · GOOGL · AMZN · META · TSLA · BRK.B · JPM · GS · BAC · CVX · LLY · JNJ · PG · KO · HD · CAT · BA · INTC · AMD · NFLX · MS

Steps:
1. For each ticker: `curl "https://agent-orchestrator.gines-rodriguez-castro.workers.dev/run?ticker=<TKR>&force=1"`.
2. Run **5 in parallel** (orchestrator handles per-ticker DAG internally).
3. After each batch, sample-check the slide-out in browser for one random ticker.
4. Log feels-wrong moments to `INIT_NOTES_MS-6.md`.

**Stop and report** if any ticker hits an error type *not* in the MS-4a flag list (UNH-style peers gap, NVDA-style transient empty-bullets). New error → fix or escalate before continuing.

**Done when**: all 25 tickers have all 11 `*_json` columns non-null in `TICKER_TREND_long` (peers may be the annotated-gap variant).

---

## MS-6g · Sector fan-out — 11 remaining (~30 min, ~66 LLM calls)

**Sectors** (reconcile against `SELECT DISTINCT sector FROM SECTOR_TREND_long` first; some may be aliased):
Media · Retail · Semiconductors · Automobiles · Financial Services · Banking · Pharmaceuticals · Consumer products · Beverages · Machinery · Aerospace & Defense

Steps:
1. For each sector: `curl "https://agent-orchestrator.gines-rodriguez-castro.workers.dev/run?sector=<NAME>&force=1"`.
2. Same pattern as MS-6f.

**Done when**: every sector has all 6 `*_json` columns non-null.

---

## MS-6h · Browser walkthrough + INIT_NOTES_MS-6 (~1h)

Steps:
1. Open `http://hedge-server:4200/mockup/v2-balanced/`.
2. Click into all 25 ticker slide-outs, all sectors, the macro slide-out, and the Tape strip.
3. Look for: blank cards, `[object Object]`, `—` where data should exist, console errors, prose that hedges instead of landing on a verdict.
4. Log everything to `docs/active/sprint-output/INIT_NOTES_MS-6.md`.
5. Tag fully-clean lights-on as `v1.1-historical-init-2026-05-06`.

**Done when**: INIT_NOTES_MS-6.md exists; tag pushed.

---

## What still has to accrue organically (after this sprint)

| Field | Wait | Why |
|---|---|---|
| `TOPIC_FEED.days_active` (full 14d) | ~14 trading days (≈3 cal weeks) | Counter requires 14 days of BETA_12 cron rows. Until then it caps at the days-of-history-on-hand. Drift verdicts still work — they just have less context. |
| Tape annotation 14-day strip in dashboard | ~14 trading days | One row per trading day in `MOVER_EXPLANATIONS_daily`. Cannot backfill without saved intraday movers data. |
| News drift "feel" stabilizing | ~5 trading days | Each day's drift verdict reads previous drift for continuity. The first few days have no prior to anchor against. |
| Earnings rhythm visualization | until next print per ticker | Earnings summaries cache per-quarter. Each ticker refreshes when its next 10-Q lands. |

**Net**: dashboard is **functionally complete** end of 2026-05-06.
**Visually mature** (full 14-day strips, stable drift) end of 2026-05-21 (~3 cal weeks of organic running).

## Cost guard

- AV budget: capped at 25/day in code. Enforce per-call sleep so a sprint mistake can't burn the daily quota.
- LLM budget for the fan-out batches:
  - 22 tickers × ~11 agents ≈ 240 calls (mostly gpt-5)
  - 11 sectors × 6 agents ≈ 66 calls (mostly gpt-5)
  - Total one-shot: ~$15 in OpenAI spend (per the credit-budget memory, this is a deliberate one-batch spend, not exploratory).
- Steady state from 2026-05-07 onward: per the post-Gemini-grounding-removal forecast, **~$18–22/month** (or ~$10 with the gpt-5-mini downgrade lever queued for a separate sprint).

## Stop and ask

- If MS-6a finds < 24mo of FRED history → escalate. We may need to extend macro-state-fetcher's backfill range.
- If MS-6b hits a Yahoo rate limit (we don't expect one but it can happen) → batch with a sleep instead of escalating.
- If MS-6f produces prose that hedges instead of landing on verdicts on >3 tickers → stop the fan-out, log to INIT_NOTES, and consult before re-running. That's a prompt-quality issue, not a data issue.

## Out of scope

- The 18-agent gpt-5 → gpt-5-mini downgrade (separate sprint, queued).
- Broadening STOCK_FACTORS_daily / FUND_01_Fundamentals to the **full** peer universe (handled by the annotated-gap fallback in MS-6e).
- Operation signals 14-day bars from the portfolio-direction memory (separate feature).
- MS-5 (validation walk + cleanup) — that follows once historical init is done and the dashboard has a few days of live data to walk through.

---

## Total budget summary

| Item | Estimate |
|---|---|
| Tomorrow's sprint effort | ~5h |
| One-shot LLM spend (fan-out) | ~$15 |
| AV calls Day 1 | ~25 |
| Days until functionally complete | 0 (end of 2026-05-06) |
| Days until visually mature (14-day strips full) | 14 trading days (~3 cal weeks) |
