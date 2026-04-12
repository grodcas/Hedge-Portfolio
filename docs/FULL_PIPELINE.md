> [STRUCTURE](STRUCTURE.md)

# Full Data Gathering Pipeline — End-to-End Reference

**Last updated**: 2026-04-12
**Purpose**: Single authoritative reference for what ACTUALLY runs every day from raw scraping to final dashboard data. Every worker, every queue hop, every AI call, every table. Read this before optimizing anything.

---

## Overview

The full pipeline has **three execution layers** that chain together:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Node.js Pipeline (src/pipeline.js)                    │
│  Runs locally. Scrapes all external sources. Uploads to D1.     │
│  Triggers the Cloudflare workflow.                               │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Cloudflare Workflow (job-engine-workflow)             │
│  Runs on CF. Polls PROC_01_Job_queue LIFO. Executes workers.     │
│  Triggered by `action: "daily_update"`.                          │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Disconnected Sub-Pipelines                            │
│  SEC report chain (report-orchestrator) — triggered manually.    │
│  Trend building (trend-orchestrator) — triggered manually.       │
│  Fundamentals fetcher — separate cron (Alpha Vantage 25/day).    │
└─────────────────────────────────────────────────────────────────┘
```

**Critical observation**: Layer 3 is **not automatically chained** to Layer 1 or 2. SEC filings land in `ALPHA_01_Reports` via Layer 1's upload step, but nothing in the current `daily_update` flow triggers `report-orchestrator` to summarize them. The report summarization chain only runs when someone manually invokes `action: "trend"` or via the legacy `news-search-unified` worker.

---

## LAYER 1 — Node.js Pipeline

**Entry point**: `src/pipeline.js` (imported via `npm run pipeline`)
**Steps**: 10 sequential phases defined at `src/pipeline.js:30-41`

### Step 1: Press Releases — `src/steps/ingest-press.js`

**What it does**: scrapes 25 company IR pages, runs AI summarization.

- `press/index.js` (147-216): sequential loop through 24 tickers (ticker list). For each:
  - Spawns child process `press/articles/{TICKER}.js` for discovery (`runTicker()`, 60s timeout)
  - Spawns child process for article content scrape (`runArticleScraper()`, 60s timeout)
  - Uses warmed Puppeteer
- `press/summary.js` (104-127): nested sequential loop (ticker × articles). For each article:
  - Spawns scraper child process
  - **One OpenAI GPT-4.1-mini call** per article (now outputs `summary`, `sentiment`, `magnitude` after Round 2)

**Parallelism**: none. All sequential.
**AI calls**: ~25 per day (GPT-4.1-mini), assumes ~1 article per ticker.
**Estimated runtime**: **45–90 seconds** (bounded by article scrape time × 25).

### Step 2: White House — `src/steps/ingest-whitehouse.js`

**What it does**: scrapes whitehouse.gov for new articles.

- `whitehouse/index.js` (96-152): sequential loop through articles found today.
- One GPT-4.1-mini call per article.

**Parallelism**: none.
**AI calls**: 0–3 per day (typically 0–2 articles/day).
**Estimated runtime**: **5–15 seconds**.

### Step 3: News — `src/steps/ingest-news.js`

**What it does**: nothing locally. Stub worth ~25 lines. Real news work happens in the CF news funnel.

**Estimated runtime**: **< 1 second**.

### Step 4: SEC Edgar — `src/steps/ingest-edgar.js`

**What it does**: Fetches SEC filings, parses HTML, clusters the parsed data. This is the longest Node.js step.

Substages (all sequential):
1. **`edgar/fetch.js` (50-121)**: Ticker loop (25 tickers).
   - Hard sleep 1.2s per ticker = 30s of pure sleep.
   - For each filing found, 800ms sleep per download = 10–30s more.
2. **`edgar/dispatch.js` (14-76)**: Sequential parse of every HTML file. Loads ticker-specific parser modules dynamically. Extracts items (10-K: 1, 7, 8; 10-Q: 1, 2, 3; 8-K: all; Form 4: transaction).
3. **`edgar/dispatch-cluster.js`**: Clusters the parsed JSON using `cluster-10k.js`, `cluster-8k.js`, `cluster-form4.js`. Max 50 clusters per chunk.

**Parallelism**: none.
**Output**: JSON files in `edgar/edgar_clustered_json/` ready for ingestion.
**Estimated runtime**: **60–120 seconds** (dominated by hardcoded rate-limit sleeps, sequential parsing).

### Step 5: Macro — `src/steps/ingest-macro.js`

**What it does**: runs `macro/index.js` which sequentially fetches 9 indicators (CPI, PPI, Employment, Bank Reserves, Interest Rates, Consumer Sentiment, Inflation Expectations, VIX Term, FOMC).

**Parallelism**: none.
**AI calls**: 0 (pure API fetches).
**Estimated runtime**: **5–10 seconds**.

### Step 6: Sentiment — `src/steps/ingest-sentiment.js`

**What it does**: fetches 3 indicators (CBOE Put/Call, AAII, COT).

- CBOE uses Puppeteer with `waitUntil: networkidle0` — the slowest single operation (~5–15s).
- AAII reads a local `.mhtml` file.
- COT is a plain HTTP fetch to CFTC.

**Parallelism**: none.
**Estimated runtime**: **10–20 seconds**.

### Step 7: Upload — `src/steps/upload.js`

**What it does**:
1. POSTs macro, sentiment, press, whitehouse data to the ingestor (sequential for-loop, lines 21-50).
2. Runs `edgar/edgar_clustered_json/AA_ingestor.js` as a child process — this POSTs the parsed SEC clusters to `/ingest/reports`, creating `ALPHA_01_Reports` rows + `ALPHA_02_Clusters` rows.
3. Fires `POST /run { action: "daily_update" }` on `job-engine-workflow` — this is the hand-off to Layer 2.

**Parallelism**: none (sequential POSTs).
**Estimated runtime**: **60–120 seconds** (EDGAR ingestion takes most of it).

### Steps 8–10: Summary, Verify, Sync

- **Step 8 (summarize)**: local aggregation, no AI.
- **Step 9 (verify-facts)**: AI fact verification of summaries, ~1 API call per summary.
- **Step 10 (sync-dashboard)**: polls `PROC_02_Workflow_status` until the CF workflow marks `done`, then caches the result locally for dashboard read.

---

## LAYER 2 — Cloudflare `daily_update` Workflow

**Entry point**: `POST /run { "action": "daily_update" }` on `job-engine-workflow`
**Code**: `workers/job-engine-workflow/src/index.js:225-297`

### What happens when `daily_update` is triggered

1. **Clears PROC_01_Job_queue** of any `done/pending/running` jobs.
2. **Fires `news-funnel-orchestrator` directly** (fire-and-forget via service binding, NOT queued). Runs in parallel with the queue.
3. **Inserts 9 jobs into PROC_01_Job_queue in REVERSE execution order** (LIFO: last inserted = highest ID = runs first).
4. **Creates a new workflow instance** which polls the queue and runs jobs sequentially.

### Execution order (actual)

| # | Worker | Model | Reads | Writes | Sequential/Parallel | Runtime |
|---|--------|-------|-------|--------|---------------------|---------|
| ⚡ | `news-funnel-orchestrator` | — | — | BETA_12 | Fire-and-forget in background | 30–45s |
| 1 | `price-fetcher` | — (Polygon API) | — | PRICE_01 | 5/min rate limit, 7 batches × 62s | **~7 min** |
| 2 | `earnings-fetcher` | — (Finnhub API) | — | FUND_02, FUND_03 | 50 parallel calls | ~3s |
| 3 | `macro-news-summarizer` | GPT-4o-mini | BETA_01, BETA_02 | BETA_07 | 1 sequential call | ~2s |
| 4 | `beta-trend-orchestrator` | — | BETA_05, BETA_06, BETA_08 | queues sub-jobs | Orchestration only | < 1s |
| 4a | └ `beta-gen-orchestrator` (if needed) | — | BETA_05, BETA_06 | queues sub-jobs | Orchestration | < 1s |
| 4ai | └─ `beta-macro-processor` (macro-summarizer) | GPT-4o-mini | BETA_03 | BETA_05 | 1 sequential call | ~2s |
| 4aii | └─ `beta-sentiment-processor` (sentiment-summarizer) | GPT-4o-mini | BETA_03, BETA_04 | BETA_06 | 1 sequential call | ~2s |
| 4aiii | └─ `beta-gen-processor` (gen-builder) | GPT-4o-mini | BETA_05, BETA_06 | BETA_08 | 1 sequential call | ~2s |
| 4b | └ `beta-trend-processor` (beta-trend-builder) | GPT-4o-mini | BETA_08 | BETA_09 | 1 sequential call | ~2s |
| 5 | `daily-macro-summarizer` | GPT-4o-mini | BETA_03, BETA_04 | BETA_10 | 1 sequential call | ~2s |
| 6 | `macro-intelligence-builder` | GPT-4o-mini (json mode) | BETA_03, BETA_04, BETA_11, BETA_12 | BETA_10 **(overwrites #5)** | 1 sequential call | ~2s |
| 7 | `assessment-engine` | GPT-4o-mini (×5 batched) | PRICE_01, FUND_01/02/03, ALPHA_01(4), BETA_12, ALPHA_03, BETA_10 | SIGNAL_01 | Pure math + 5 batched AI explanations | ~4s |
| 8 | `probability-engine` | — | SIGNAL_01, SIGNAL_02 (prior) | SIGNAL_02 | Pure math | < 1s |
| 9 | `consensus-validator` | Gemini 2.5-flash (×6 parallel) | SIGNAL_01 (top 5), BETA_10 | SIGNAL_03 | 6 parallel Gemini calls | ~10s |
| 10 | `event-attribution-engine` | — | PRICE_01, ALPHA_01, ALPHA_03, BETA_12 | SIGNAL_04 | Pure math + SQL | ~2s |

**Total `daily_update` wall-clock time**: **~8–10 minutes**, dominated by `price-fetcher` (~7 min).

### Notes

- **`news-funnel-orchestrator`** internally fires **33 parallel `gpt-5-mini` calls** in `news-funnel-filter` (v2) — one per ticker (25) + one per macro category (8) — plus Gemini summarization per selected headline.
- **BETA_10 is written twice**: first by `daily-macro-summarizer` (plain text), then overwritten by `macro-intelligence-builder` (structured JSON). The first write is redundant.
- **`fundamentals-fetcher` is NOT in `daily_update`** — separate trigger (`action: "fundamentals"`) because Alpha Vantage free tier is 25 calls/day total. Currently has no cron wiring; must be called manually.

---

## LAYER 3 — Disconnected Sub-Pipelines

These exist but are not automatically triggered by `daily_update`. They run only when manually invoked via specific actions or by legacy flows.

### 3A — SEC Report Summarization Chain (THE BIGGEST BOTTLENECK)

**Triggered by**: `report-orchestrator` called with a `report_id`.
**Currently triggered from**:
- `trend-orchestrator` (when building a ticker trend and a historical report has no summary)
- `news-search-unified` worker (legacy; runs via `action: "daily_news"`)
- `news-orchestrator` worker (legacy)
- **NOT** by the Node.js upload step or the current `daily_update` flow

**Code**: `workers/report-orchestrator/src/worker.js`

#### Flow per report

```
report-orchestrator (one invocation per report_id)
  │
  ├── For Form 4:
  │     Queue `form4-summarizer` (1 job)
  │     → form4-summarizer runs 1–4 GPT-4o-mini calls (varies with cluster count)
  │
  ├── For 8-K:
  │     Queue `8k-summarizer` (1 job)
  │     → 8k-summarizer runs 1–6 GPT-4o-mini calls
  │
  └── For 10-K / 10-Q (THE EXPENSIVE CASE):
        1) Queue `qk-report-summarizer` (final, runs last — LIFO)
        2) Queue `qk-structure-builder` (middle, runs second)
        3) Fire cluster summaries IN PARALLEL via direct service binding:
             Promise.allSettled(
               invalidClusters.map(c =>
                 env.qk_cluster_summarizer.fetch(...)
               )
             )
           → This happens INSIDE the report-orchestrator invocation,
             NOT through the job queue. All clusters fire simultaneously.
```

#### Per-worker detail

| Worker | Trigger | Model | AI Calls | Time |
|---|---|---|---|---|
| `qk-cluster-summarizer` | Direct service binding (parallel Promise.allSettled) | **GPT-5-mini** | **20 parallel** (one per cluster) | ~3–5s TOTAL (bounded by slowest, NOT 60s) |
| `qk-structure-builder` | Job queue (after clusters) | GPT-5-mini | 1 | ~2–3s |
| `qk-report-summarizer` | Job queue (after structure) | **GPT-5.2** | 1 | ~3–5s |

**Critical correction to earlier analysis**: The 20 cluster calls run **in parallel via `Promise.allSettled`** inside `report-orchestrator`'s own request handler. They do NOT go through the job queue. So a single 20-cluster 10-K processes in ~8–12 seconds total, NOT 60 seconds.

The ONLY sequential bottleneck within a single report is:
- All-clusters-parallel (~5s) → structure-builder (~3s) → report-summarizer (~4s) = **~12s per 10-K/10-Q**

#### BUT here's the real bottleneck: multiple reports going through the chain

Because `qk-structure-builder` and `qk-report-summarizer` go through the job queue (sequential), when multiple reports arrive at once, **each report's structure and summarizer jobs block each other**.

**Example — worst case — trend backfill for 1 ticker**:

```
trend-orchestrator for AAPL
  → needs 4 reports with summaries
  → if all 4 are missing summaries, queues 4 × report-orchestrator jobs
  → plus 1 trend-builder job at the end

Job queue execution (sequential, one at a time):
  Job 1: report-orchestrator for report A
    → fires 20 parallel cluster calls (~5s)
    → queues qk-structure-builder A + qk-report-summarizer A
    → returns
  Job 2: qk-structure-builder A (~3s)
  Job 3: qk-report-summarizer A (~4s)
  Job 4: report-orchestrator for report B
    → 20 parallel clusters (~5s)
    → queues qk-structure-builder B + qk-report-summarizer B
  Job 5: qk-structure-builder B (~3s)
  Job 6: qk-report-summarizer B (~4s)
  ... (repeat for reports C, D)
  Final: trend-builder (~5s)

Total: 4 × (5s + 3s + 4s) + 5s = 53s per ticker trend backfill
```

**Full portfolio trend backfill (25 tickers × 4 reports each = 100 reports)**:

If starting from scratch, trend backfill for all 25 tickers is:
- ~100 × (5s cluster-parallel + 3s structure + 4s summary) = ~1200s = **~20 minutes**
- Plus 25 × 5s trend-builder = ~125s = **~2 min**
- **Total: ~22 minutes** for first-time trend setup

This only happens once (or when new quarters arrive). Day-to-day, it's 0–3 new filings per day, which is ~30–60 seconds.

### 3B — Trend Building Chain — `trend-orchestrator`

**Triggered by**: `action: "trend"` with a `ticker` parameter (manual per-ticker call).
**Code**: `workers/trend-orchestrator/src/worker.js`

#### Flow

1. Query last 4 `10-K`/`10-Q` reports for the ticker from `ALPHA_01_Reports`.
2. If fewer than 4 exist, return 409.
3. Queue `trend-builder` as the FINAL job (LIFO, lowest ID, runs last).
4. For each of the 4 reports missing a summary, queue a `report-orchestrator` job.

#### `trend-builder`

- **Model**: GPT-5.2
- **Reads**: the 4 reports with summaries (joined chronologically).
- **Writes**: `ALPHA_04_Trends`
- **Runtime**: ~5 seconds (one big AI call).

### 3C — Fundamentals Fetcher — `fundamentals-fetcher`

**Triggered by**: `action: "fundamentals"` — currently not automatically wired anywhere.
**Why separate**: Alpha Vantage free tier is 25 calls/day total. Running it daily inside `daily_update` would burn the whole allowance in one shot, and if the CF workflow retries (which it does on failure), you'd blow past the limit.

**Recommendation**: set up a Cloudflare cron trigger on this worker directly (`wrangler.jsonc` `triggers.crons`), running once per day in the evening. Independent of the main pipeline.

---

## Full Pipeline Timing — End to End

### Current state (everything sequential)

```
LAYER 1 — Node.js (src/pipeline.js)
├── Step 1 Press         ~60s
├── Step 2 WH            ~10s
├── Step 3 News          ~1s (stub)
├── Step 4 Edgar         ~90s
├── Step 5 Macro         ~8s
├── Step 6 Sentiment     ~15s
├── Step 7 Upload        ~60s (mostly EDGAR ingest)
├── Step 8 Summarize     ~5s
├── Step 9 Verify        ~30s
└── Step 10 Sync-poll    varies
SUBTOTAL                 ~280s (~4.5 min) + polling time

LAYER 2 — Cloudflare daily_update
├── news-funnel-orch     ~35s (fire-and-forget, runs in parallel)
├── price-fetcher        ~420s (7 min) ← BIGGEST SINGLE BOTTLENECK
├── earnings-fetcher     ~3s
├── macro-news-summ      ~2s
├── beta-trend-orch+sub  ~8s
├── daily-macro-summ     ~2s (WASTED — overwritten)
├── macro-intel-builder  ~2s
├── assessment-engine    ~4s
├── probability-engine   ~1s
├── consensus-validator  ~10s
└── event-attribution    ~2s
SUBTOTAL                 ~460s (~7.5 min)

LAYER 3 — Normally 0s unless new SEC filings
├── SEC report chain     ~10s per new 10-K/10-Q (rare, daily)
├── Trend backfill       ~22 min ONE TIME setup or new quarter

TOTAL normal day         ~12–13 min (Layer 1 + Layer 2 + sync overhead)
TOTAL backfill day       ~35 min (+ Layer 3 trend backfill)
```

---

## Dependency Graph

```
                         ┌───────────────────────────────────┐
                         │ src/pipeline.js (Node.js)         │
                         └──────────────┬────────────────────┘
                                        │
        ┌───────────┬────────┬──────────┼──────────┬─────────┬──────────┐
        ▼           ▼        ▼          ▼          ▼         ▼          ▼
     press/     whitehouse/ news/    edgar/      macro/   sentiment/  (verify)
     index.js+  index.js    stub   (fetch +    index.js  index.js
     summary.js             (noop) dispatch +
                                   cluster)
        │           │        │          │          │         │
        └───────────┴────────┴──────────┴──────────┴─────────┘
                                        │
                                        ▼
                              upload.js POSTs to ingestor
                              │
                              ├── /ingest/press → ALPHA_03_Press
                              ├── /ingest/whitehouse → BETA_02_WH
                              ├── /ingest/macro → BETA_03_Macro
                              ├── /ingest/sentiment → BETA_04_Sentiment
                              └── AA_ingestor.js → /ingest/reports → ALPHA_01/02
                                        │
                                        ▼
                              POST /run {action:"daily_update"}
                                        │
                                        ▼
  ╔═════════════════ CLOUDFLARE daily_update ═════════════════╗
  ║                                                            ║
  ║  news-funnel-orch (parallel, fire-and-forget)              ║
  ║     ├── news-funnel-gatherer (RSS + Finnhub)               ║
  ║     ├── news-funnel-filter v2 (33 parallel gpt-5-mini)     ║
  ║     └── Gemini summaries → BETA_12_News_digest             ║
  ║                                                            ║
  ║  PROC_01_Job_queue (LIFO, sequential):                     ║
  ║                                                            ║
  ║  price-fetcher → PRICE_01_Daily                            ║
  ║  earnings-fetcher → FUND_02, FUND_03                       ║
  ║  macro-news-summarizer → BETA_07                           ║
  ║  beta-trend-orchestrator                                   ║
  ║    └ beta-gen-orchestrator                                 ║
  ║        ├ macro-summarizer → BETA_05                        ║
  ║        ├ sentiment-summarizer → BETA_06                    ║
  ║        └ gen-builder → BETA_08                             ║
  ║    └ beta-trend-builder → BETA_09                          ║
  ║  daily-macro-summarizer → BETA_10 (overwritten next)       ║
  ║  macro-intelligence-builder → BETA_10 (JSON)               ║
  ║  assessment-engine → SIGNAL_01                             ║
  ║  probability-engine → SIGNAL_02                            ║
  ║  consensus-validator → SIGNAL_03                           ║
  ║  event-attribution-engine → SIGNAL_04                      ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
                                        │
                                        ▼
                         PROC_02_Workflow_status = 'done'
                                        │
                                        ▼
                         sync-dashboard.js polls → cache → done

  ┌── DISCONNECTED SUB-PIPELINES (NOT triggered by daily_update) ──┐
  │                                                                 │
  │  trend-orchestrator (action: "trend", per ticker)               │
  │     └ for each missing report: report-orchestrator              │
  │         ├ qk-cluster-summarizer × 20 (PARALLEL)                 │
  │         ├ qk-structure-builder (sequential queue job)           │
  │         └ qk-report-summarizer (sequential queue job)           │
  │     └ trend-builder → ALPHA_04_Trends                           │
  │                                                                 │
  │  fundamentals-fetcher (action: "fundamentals")                  │
  │     → FUND_01_Fundamentals (25 calls, rate-limited)             │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

---

## AI Call Inventory (Per Daily Run)

### Layer 1 (local Node.js)
- Press summarization: ~25 × GPT-4.1-mini (1 per article)
- Whitehouse summarization: 0–3 × GPT-4.1-mini
- Fact verification: ~varies
- **Subtotal**: ~25–30 OpenAI calls

### Layer 2 (Cloudflare daily_update)
- `news-funnel-filter` (v2): **33 × gpt-5-mini** (parallel)
- `news-funnel-orchestrator` Gemini summaries: ~15–20 × Gemini 2.5-flash (batched)
- `macro-news-summarizer`: 1 × GPT-4o-mini
- `macro-summarizer`: 1 × GPT-4o-mini
- `sentiment-summarizer`: 1 × GPT-4o-mini
- `gen-builder`: 1 × GPT-4o-mini
- `beta-trend-builder`: 1 × GPT-4o-mini
- `daily-macro-summarizer`: 1 × GPT-4o-mini
- `macro-intelligence-builder`: 1 × GPT-4o-mini (JSON)
- `assessment-engine` explanations: 25 × GPT-4o-mini (batched 5 at a time)
- `consensus-validator`: 6 × Gemini 2.5-flash
- **Subtotal**: ~85 AI calls

### Layer 3 (on demand — SEC processing)
- Per 10-K/10-Q: 20 × GPT-5-mini (cluster parallel) + 1 × GPT-5-mini (structure) + 1 × GPT-5.2 (report)
- Per 8-K: 1–6 × GPT-4o-mini
- Per Form 4: 1–4 × GPT-4o-mini
- Per trend (ticker): 1 × GPT-5.2
- **Subtotal normal day**: 0–30 calls (depends on filing activity)
- **Subtotal backfill**: ~2200 calls (100 reports × 22 AI calls)

**Total normal day**: ~140 AI calls.
**Total backfill day**: ~2400 AI calls.

---

## Known Gaps and Discontinuities

These are things I noticed while tracing the pipeline. They're not bugs per se — they're architectural holes that matter for optimization and data integrity.

### Gap 1: SEC filings land but are not automatically summarized

`upload.js` calls `AA_ingestor.js` which POSTs to `/ingest/reports`. That writes rows to `ALPHA_01_Reports` and `ALPHA_02_Clusters`. **Nothing then triggers `report-orchestrator` to summarize them.** The new filings sit with empty `summary` fields until someone manually runs `action: "trend"` for that ticker.

This is a real gap. If the user expects daily SEC signal, they're not getting it unless the trend action is also invoked.

### Gap 2: `BETA_10_Daily_macro` is written twice

- `daily-macro-summarizer` writes a plain-text summary (from Round 0, original).
- `macro-intelligence-builder` then overwrites it with structured JSON (added Round 2).

The first call is wasted. Drop `daily-macro-summarizer` from the chain.

### Gap 3: `fundamentals-fetcher` is orphaned

Deployed, has secrets, but nothing triggers it. Needs a cron trigger in its own `wrangler.jsonc`.

### Gap 4: `event-attribution-engine` runs at the END but doesn't need assessment

It's queued last in the signal layer, implying it depends on `assessment-engine` output. It doesn't — it only reads `PRICE_01`, `ALPHA_01`, `ALPHA_03`, `BETA_12`. It could run in parallel with `assessment-engine`, saving ~4 seconds.

### Gap 5: `daily_update` doesn't include trend or report processing

If trend building is important for the scoring chain (it feeds `ALPHA_04_Trends` which is referenced in older factor designs), it needs to be triggered somewhere in the daily flow — probably via a `trend-orchestrator` call per ticker after SEC ingestion.

### Gap 6: Node.js scraping steps 1-6 are fully sequential

Six completely independent data sources (press, whitehouse, news, edgar, macro, sentiment) all run one after another in `src/pipeline.js`. A single `Promise.all` on the six step functions would bound the whole scrape phase to the slowest step (Edgar ~90s) instead of the sum (~180s).

### Gap 7: Within each scraper, per-ticker loops are sequential

`edgar/fetch.js` loops 25 tickers with 1.2s hardcoded sleep between each (30s of pure sleep). `press/index.js` loops 24 tickers sequentially with Puppeteer. Both could batch several tickers in parallel while still respecting rate limits.

---

## Table Inventory (Writes by Layer)

| Table | Written by | Frequency |
|---|---|---|
| `ALPHA_01_Reports` | Layer 1 (upload.js → AA_ingestor.js) | Per SEC filing |
| `ALPHA_02_Clusters` | Layer 1 (upload.js → AA_ingestor.js) | Per SEC filing |
| `ALPHA_03_Press` | Layer 1 (upload.js) | Daily |
| `ALPHA_04_Trends` | Layer 3 (trend-builder) | Per ticker, manual |
| `ALPHA_05_Daily_news` | Layer 2 (legacy news-summarizer) | Daily, deprecated |
| `BETA_01_News` | Layer 1 (news direct upload) | Daily |
| `BETA_02_WH` | Layer 1 | Daily |
| `BETA_03_Macro` | Layer 1 | Daily |
| `BETA_04_Sentiment` | Layer 1 | Daily |
| `BETA_05_Macro_Processed` | Layer 2 (macro-summarizer) | Daily |
| `BETA_06_Sentiment_Processed` | Layer 2 (sentiment-summarizer) | Daily |
| `BETA_07_News_Processed` | Layer 2 (macro-news-summarizer) | Daily |
| `BETA_08_Gen_Processed` | Layer 2 (gen-builder) | Daily |
| `BETA_09_Trend` | Layer 2 (beta-trend-builder) | Daily |
| `BETA_10_Daily_macro` | Layer 2 (macro-intelligence-builder, overwrites daily-macro-summarizer) | Daily |
| `BETA_11_Macro_news` | Layer 2 (legacy macro-news-orchestrator, not in daily_update) | On demand |
| `BETA_12_News_digest` | Layer 2 (news-funnel-orchestrator) | Daily |
| `PRICE_01_Daily` | Layer 2 (price-fetcher) | Daily |
| `FUND_01_Fundamentals` | Layer 3 (fundamentals-fetcher, manual) | On demand (25/day limit) |
| `FUND_02_Earnings` | Layer 2 (earnings-fetcher) | Daily |
| `FUND_03_Recommendations` | Layer 2 (earnings-fetcher) | Daily |
| `SIGNAL_01_Assessment` | Layer 2 (assessment-engine) | Daily |
| `SIGNAL_02_Probability` | Layer 2 (probability-engine) | Daily |
| `SIGNAL_03_Consensus` | Layer 2 (consensus-validator) | Daily |
| `SIGNAL_04_Attributions` | Layer 2 (event-attribution-engine) | Daily |
| `PROC_01_Job_queue` | Layer 2 (all orchestrators) | Continuous |
| `PROC_02_Workflow_status` | Layer 2 (workflow runner) | Per run |
| `PROC_03_News_staging` | Layer 2 (legacy) | On demand |
| `GAMMA_01_Verification` | Layer 1 (verify-facts) | Daily |

---

> [STRUCTURE](STRUCTURE.md)
