# Hedge Portfolio — System Reference

**Subtitle:** Production reference. Where every dashboard number comes from, what every agent does, and what every prompt asks.

**Repository:** `/Users/gines/Hedge-Portfolio`
**Snapshot:** commit `12bf9ba` (April 2026)
**Audience:** the operator. Read this to validate that any number on the dashboard is real.

---

## 1. How to read this document

The system is one large pipeline. **Raw external data → scraped → stored in D1 → processed by workers (deterministic + LLM) → queried by the dashboard.** Every visible field on the dashboard has a chain. Each section below covers one layer of that chain.

If a number on the dashboard looks wrong, this is the order to check:

1. **Section 7 — Dashboard bibliography.** Find the panel. Read its trace.
2. **Section 5 — Workers.** Find the worker that wrote the table the panel reads. Confirm its trigger fired.
3. **Section 6 — Prompts.** If the worker uses an LLM, read its exact prompt. The output should obey the rules in the prompt.
4. **Section 3 — Origin layer.** If the worker's input was wrong, walk back to the scraper that produced it.
5. **Section 8 — Known gaps.** If a panel renders empty / placeholder / hardcoded, it is probably listed here.

The `8 — Known gaps` section is the single most important page. Read it first if you are auditing trust.

---

## 2. The system at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                            │
│                                                                     │
│  SEC EDGAR · BLS · FRED · UMich · CFTC · CBOE · AAII · Finnhub      │
│  Polygon · Alpha Vantage · Yahoo · Whitehouse RSS · Federal Reserve │
│  · 24 Investor-Relations newsroom pages · Bloomberg/WSJ/Reuters RSS │
└─────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORIGIN LAYER                                     │
│                                                                     │
│  (a) src/pipeline.js — 10-step Node orchestrator on Linux server   │
│      cron `22:30 UTC` via systemd timer (hedge-pipeline.timer)     │
│  (b) economic-calendar-fetcher worker — cron 00:00 UTC             │
│  (c) fomc-statement-fetcher    worker — cron 00:00 UTC             │
│  (d) macro-state-fetcher       worker — cron 00:10 UTC             │
└─────────────────────────────────────────────────────────────────────┘
                       │  POST /ingest/* + scheduled D1 writes
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    D1 STORAGE   (one Cloudflare D1 database)        │
│                                                                     │
│  Raw scraped     :  ALPHA_03_Press, ALPHA_01_Reports, BETA_02_WH,   │
│                     BETA_03_Macro, BETA_04_Sentiment,                │
│                     PRICE_01_Daily, FUND_01_Fundamentals,            │
│                     FUND_02_Earnings, FUND_03_Recommendations,       │
│                     MACRO_STATE_indicators / _calendar / _fomc       │
│                                                                     │
│  Derived         :  STOCK_FACTORS_daily, SECTOR_FACTORS_daily,      │
│                     POSITION_01_Daily, NAV_01_Daily,                │
│                     SIGNAL_01_Assessment, MOVER_EXPLANATIONS_daily,  │
│                     SIGNAL_HISTORY_daily, BETA_12_News_digest,       │
│                     BETA_10_Daily_macro                              │
│                                                                     │
│  LLM-narrative   :  TICKER_TREND_long / _short, SECTOR_TREND_*,      │
│                     NARRATIVE_01_Content, OPERATION_01_Signals,      │
│                     SIGNAL_03_ValuationCurve_long / _short           │
└─────────────────────────────────────────────────────────────────────┘
                       │  /query/* via portfolio-ingestor worker
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYER  (~40 Cloudflare Workers)       │
│                                                                     │
│  Factor builders   stock/sector-factor-builder      (deterministic) │
│  Trend builders    ticker/sector-trend-long/short   (GPT-5)         │
│  Narrators (8)     dispatcher → regime/sector/stock/                │
│                    sector-landscape/stock-landscape/lede            │
│                    (GPT-5 + GPT-4o-mini)                            │
│  Macro             macro-intelligence-builder       (GPT-5 ×3)      │
│                    macro-state-fetcher              (deterministic) │
│  News              news-funnel-orchestrator → gatherer → filter     │
│                                            → Gemini summaries       │
│                    (GPT-5-mini ×33 + Gemini 2.5-flash ×40)          │
│  Movers            big-movers-why                   (GPT-5)         │
│  Operations        operations-agent                 (GPT-5)         │
│  Valuation         valuation-curve-builder          (GPT-5)         │
│  Attribution       event-attribution-engine         (deterministic) │
│  Assessment        assessment-engine                (GPT-4o-mini)   │
│  Calibration       (computed inside ingestor /query/calibration)    │
│  Signals           signal-history-builder           (deterministic) │
│  Portfolio         position-builder, nav-builder    (deterministic) │
│                    wealth-distribution              (read-only)     │
└─────────────────────────────────────────────────────────────────────┘
                       │  /api/* via dashboard/server.js (proxy)
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD                                         │
│  Linux server, Express on port 4200, exposed via Cloudflare Tunnel  │
│  Tabs:  PM · Portfolio (5 layers) · Calendar · News · Validation    │
└─────────────────────────────────────────────────────────────────────┘
```

### Cron / cadence summary

| Time (UTC)  | Trigger                              | What happens                                         |
|-------------|--------------------------------------|------------------------------------------------------|
| `00:00`     | `economic-calendar-fetcher` cron     | Pulls Finnhub economic calendar → `MACRO_STATE_calendar` |
| `00:00`     | `fomc-statement-fetcher` cron        | Refreshes FOMC statements → `MACRO_STATE_fomc`       |
| `00:10`     | `macro-state-fetcher` cron           | FRED + BLS → `MACRO_STATE_indicators`                |
| `01:15`     | `valuation-curve-builder` cron (short) | Re-runs short-curve LLM if events fired            |
| `01:30`     | `valuation-curve-builder` cron (long)  | Re-runs long-curve LLM at floor cadence            |
| `06:00`     | `narrator-dispatcher` safety sweep   | 7-day rebuild floor — re-runs any stale narrator     |
| `*/15 min`  | `narrator-dispatcher` event tick     | Polls source tables, fans out to narrator workers   |
| `22:30`     | `hedge-pipeline.timer` (Linux)       | Local 10-step pipeline — scrapers + ingest + workflow |

The Linux pipeline at 22:30 fires the bulk of the daily refresh. The Cloudflare cron workers cover macro releases (which AV/SEC publish at midnight UTC). The narrator dispatcher's 15-minute tick covers intra-day news + factor changes.

\pagebreak

## 3. Origin layer

### 3.1 The 10-step Node pipeline (`src/pipeline.js`)

Run via `node src/pipeline.js` on the Linux server, normally fired by `hedge-pipeline.timer` at 22:30 UTC. Each step writes locally and/or POSTs to a Cloudflare Worker endpoint.

| #  | Step                    | Inputs                                          | Output                                              | LLM    | Failure modes                              |
|----|-------------------------|-------------------------------------------------|-----------------------------------------------------|--------|--------------------------------------------|
| 1  | `ingest-press`          | 24 IR newsroom pages via Puppeteer              | `press/AA_press_summary.json` → `/ingest/press`     | Y¹     | Cloudflare anti-bot, parser drift          |
| 2  | `ingest-whitehouse`     | whitehouse.gov RSS + FOMC RSS                   | `whitehouse_summary.json` → `/ingest/whitehouse`    | Y¹     | RSS layout change, OpenAI rate limit       |
| 3  | `ingest-news`           | (no-op stub; real work server-side)             | logs handoff to `news-funnel-orchestrator` worker  | (n/a)  | Server-side workflow stalls                |
| 4  | `ingest-edgar`          | SEC EDGAR submissions API → HTML downloads     | `edgar_clustered_json/*.json` → `/ingest/reports`   | N      | SEC API down, parser crash, accession mismatch |
| 5  | `ingest-macro`          | BLS, FRED, UMich, Yahoo, Fed RSS                | `macro_summary.json` → `/ingest/macro`              | N      | API outage, TLS-fingerprint blocks         |
| 6  | `ingest-sentiment`      | AAII live + MHTML fallback, CFTC (curl), CBOE   | `sentiment_summary.json` → `/ingest/sentiment`      | N      | AAII layout drift; MHTML staleness         |
| 7  | `upload`                | the JSON files above + fundamentals             | POSTs to all `/ingest/*` endpoints + `/run` workflow | N      | Network, ingestor 5xx                     |
| 7b | `fetch-fundamentals`    | Alpha Vantage OVERVIEW (daily) + IS/BS/CF       | `/ingest/fundamentals`                              | N²     | AV rate limit (25/day free)                |
| 8  | `summarize`             | validation results from steps 1-7               | `dashboard_YYYY-MM-DD.json` → `/ingest/pipeline-validation` | N | (none — pure aggregation) |
| 9  | `verify-facts`          | `press/AA_press_summary.json`                   | `/ingest/verification`                              | Y³     | Skip ratio ≥50% triggers loud warning      |
| 10 | `sync-dashboard`        | polls `/query/workflow-status` + queries D1     | local cache JSON                                    | N      | Workflow timeout (5min cap)                |

¹ See § 6 for the exact prompts (press uses GPT-4o-mini for sentiment/magnitude, whitehouse uses GPT-4o-mini for neutral summary).
² IS/BS/CF passes are **event-driven**, not daily: skipped unless SEC has a new 10-Q whose period > our stored `fiscal_period_ending`, AND ≥2 days have passed since SEC filing (AV index lag).
³ Hallucination checker is GPT-4o-mini.

### 3.2 Standalone scrapers

| Module               | Tickers / Coverage             | Source                                                              | Output                                          |
|----------------------|--------------------------------|---------------------------------------------------------------------|-------------------------------------------------|
| `press/`             | 24 (TSLA excluded)             | Per-ticker IR Puppeteer crawlers in `press/feeds/*.js`              | `AA_press_summary.json`                         |
| `edgar/`             | 25 incl. TSLA                  | SEC EDGAR submissions API + HTML archives                           | `edgar_clustered_json/*.json`                   |
| `macro/`             | n/a (economy-wide)             | BLS, FRED, UMich, Yahoo VIX, Fed RSS                                | `macro_summary.json` (8 indicator groups)       |
| `sentiment/`         | n/a (broad market)             | AAII, CFTC COT (E-mini S&P/NQ), CBOE put/call                       | `sentiment_summary.json`                        |
| `whitehouse/`        | n/a (policy)                   | whitehouse.gov RSS + per-article HTML                               | `whitehouse_summary.json`                       |
| `news/index.js`      | dead — replaced server-side    | Was: pre-downloaded Bloomberg/WSJ/Reuters HTML                      | (none — kept for manual backfill only)          |

**TSLA press gap:** Tesla newsroom is anti-bot-protected; Puppeteer is blocked. TSLA is intentionally absent from `press/index.js` TICKERS dict. SEC and fundamentals coverage are unaffected — TSLA appears in those.

\pagebreak

## 4. Database (D1)

Single D1 database `portfolio-db` (id `e306b0a8-…`). Worker `portfolio-ingestor` is the single writer for raw-scraped tables; other workers (factor builders, narrators, etc.) write directly to their own tables via D1 binding.

### 4.1 Raw / origin tables (written by scrapers via `/ingest/*`)

| Table                          | Writer                                          | Reader(s)                                              |
|--------------------------------|-------------------------------------------------|--------------------------------------------------------|
| `ALPHA_03_Press`               | `/ingest/press` ← step 1                        | narrator/stock, dashboard `/api/press/{date}`          |
| `ALPHA_01_Reports`             | `/ingest/reports` ← step 4 (AA_ingestor.js)     | ticker-trend-long, valuation-curve-builder, narrator   |
| `BETA_02_WH`                   | `/ingest/whitehouse` ← step 2                   | dashboard `/api/whitehouse/{date}`, narrator/regime    |
| `BETA_03_Macro`                | `/ingest/macro` ← step 5                        | dashboard `/api/macro/{date}`, macro-intelligence      |
| `BETA_04_Sentiment`            | `/ingest/sentiment` ← step 6                    | dashboard `/api/sentiment/{date}`                       |
| `FUND_01_Fundamentals`         | `/ingest/fundamentals` ← step 7b                | stock-factor-builder, valuation-curve-builder, dashboard |
| `FUND_02_Earnings`             | earnings-fetcher (worker)                       | stock-factor-builder, ticker-trend-long, narrator/stock |
| `FUND_03_Recommendations`      | (not yet wired to a daily writer)               | stock-factor-builder (eps_rev_4w + rev_breadth_4w)     |
| `PRICE_01_Daily`               | price-fetcher (worker, called via job-engine)   | factor builders, position-builder, valuation-curve, etc. |
| `MACRO_STATE_indicators`       | macro-state-fetcher (cron 00:10 UTC)            | narrator/regime, dashboard `/api/indicator-history`     |
| `MACRO_STATE_calendar`         | economic-calendar-fetcher (cron 00:00 UTC)      | narrator/* (gather modules), dashboard `/api/calendar`  |
| `MACRO_STATE_fomc`             | fomc-statement-fetcher (cron 00:00 UTC)         | narrator/regime, macro-intelligence-builder            |
| `BETA_12_News_digest`          | news-funnel-orchestrator (server-side workflow) | narrator/*, dashboard `/api/news-digest/{date}`         |

### 4.2 Derived (deterministic) tables

| Table                          | Writer                                  | Reader(s)                                             |
|--------------------------------|-----------------------------------------|-------------------------------------------------------|
| `STOCK_FACTORS_daily`          | stock-factor-builder                    | dashboard `/api/stock-factors`, narrator/stock        |
| `SECTOR_FACTORS_daily`         | sector-factor-builder                   | dashboard `/api/sector-factors`, narrator/sector      |
| `POSITION_01_Daily`            | position-builder                        | dashboard `/api/positions`, nav-builder               |
| `NAV_01_Daily`                 | nav-builder                             | dashboard `/api/nav`, attribution computation        |
| `TRADE_01_Ledger`              | dashboard `POST /api/trades` (manual)   | position-builder, nav-builder, dashboard              |
| `MOVER_EXPLANATIONS_daily`     | big-movers-why                          | dashboard `/api/movers`                               |
| `SIGNAL_01_Assessment`         | assessment-engine                       | narrator/stock, dashboard `/api/portfolio-signals`    |
| `SIGNAL_HISTORY_daily`         | signal-history-builder                  | ticker-trend-short (trigger logic), narrator/stock    |
| `SIGNAL_03_ValuationCurve_*`   | valuation-curve-builder                 | dashboard `/api/valuation-curve` (entity view)        |

### 4.3 LLM-narrative tables

| Table                          | Writer                                | Purpose                                                         |
|--------------------------------|---------------------------------------|-----------------------------------------------------------------|
| `BETA_10_Daily_macro`          | macro-intelligence-builder            | Daily blob: trend (8w regime), today (consistency), recommendation, scenarios, sector_tilt |
| `TICKER_TREND_long`            | ticker-trend-long                     | Per-ticker fundamental thesis (refreshed on new 10-Q)           |
| `TICKER_TREND_short`           | ticker-trend-short                    | Per-ticker tactical thesis (event-triggered or 7d staleness)    |
| `SECTOR_TREND_long`            | sector-trend-long                     | Per-sector structural thesis                                    |
| `SECTOR_TREND_short`           | sector-trend-short                    | Per-sector tactical thesis                                      |
| `NARRATIVE_01_Content`         | narrator workers (regime/sector/stock + landscapes + lede) | Multi-row per entity: current_reading, identification, recommendation, lede |
| `OPERATION_01_Signals`         | operations-agent                      | Trade suggestions per sector                                    |

### 4.4 Audit / pipeline state

| Table                          | Writer                | Purpose                                                   |
|--------------------------------|-----------------------|-----------------------------------------------------------|
| `PIPELINE_VALIDATION`          | step 8 `summarize`    | Per-source validation snapshot (dashboard Validation tab) |
| `GAMMA_01_Verification`        | step 9 `verify-facts` | Hallucination check results                               |

### 4.5 Orphans / accepted leftovers

- **`ALPHA_04_Trends`** — orphan-write. `portfolio-ingestor` `/ingest/trends` still writes; nothing reads. Decommissioned trend chain leftover. Documented in `docs/STRUCTURE.md`.
- **`SECTOR_FACTORS_daily.flow_5d`** — column always `NULL`. Intended for ETF-flow data, no source exists. Harmless.

\pagebreak

## 5. Processing layer (workers)

### 5.1 Ingestion / storage

| Worker                | Trigger              | Reads                          | Writes                                          | LLM | Purpose                                                          |
|-----------------------|----------------------|--------------------------------|-------------------------------------------------|-----|------------------------------------------------------------------|
| `portfolio-ingestor`  | HTTP `/ingest/*`, `/query/*` | n/a                            | every raw-scraped table                         | No  | Single ingest endpoint; also serves dashboard `/api/*` queries.  |

### 5.2 Fetchers (external API → D1)

| Worker                       | Trigger              | External source                        | Writes                          | LLM |
|------------------------------|----------------------|----------------------------------------|---------------------------------|-----|
| `price-fetcher`              | called by job-engine | Polygon.io daily bars                  | `PRICE_01_Daily`                | No  |
| `earnings-fetcher`           | called by job-engine | Finnhub earnings                       | `FUND_02_Earnings`              | No  |
| `economic-calendar-fetcher`  | cron `0 0 * * *`     | Finnhub economic calendar              | `MACRO_STATE_calendar`          | No  |
| `fomc-statement-fetcher`     | cron `0 0 * * *`     | Federal Reserve press releases         | `MACRO_STATE_fomc`              | No  |
| `macro-state-fetcher`        | cron `10 0 * * *`    | FRED + BLS                             | `MACRO_STATE_indicators`        | No  |

### 5.3 Factor builders (deterministic math)

| Worker                  | Trigger              | Reads                                                        | Writes                  |
|-------------------------|----------------------|--------------------------------------------------------------|-------------------------|
| `stock-factor-builder`  | called by job-engine | `PRICE_01_Daily`, `FUND_01/02/03_*`                          | `STOCK_FACTORS_daily`   |
| `sector-factor-builder` | called by job-engine | `PRICE_01_Daily`, `STOCK_FACTORS_daily`, sector ETF prices   | `SECTOR_FACTORS_daily`  |
| `position-builder`      | called by job-engine | `TRADE_01_Ledger`, `PRICE_01_Daily`                          | `POSITION_01_Daily`     |
| `nav-builder`           | called by job-engine | `POSITION_01_Daily`, `TRADE_01_Ledger`                       | `NAV_01_Daily`          |
| `signal-history-builder`| called by job-engine | `BETA_12_News_digest`, `FUND_02_Earnings`, `PRICE_01_Daily`  | `SIGNAL_HISTORY_daily`  |
| `event-attribution-engine` | called after price-fetcher + assessment | `PRICE_01_Daily`, `SIGNAL_01_Assessment`, `BETA_10_Daily_macro` | event-attribution rows |

### 5.4 News funnel

| Worker                       | Trigger                         | Reads                                  | Writes                  | LLM                                |
|------------------------------|---------------------------------|----------------------------------------|-------------------------|------------------------------------|
| `news-funnel-orchestrator`   | called by job-engine            | service-binds gatherer + filter        | `BETA_12_News_digest`   | Yes — Gemini 2.5 Flash (~40 calls per run, Google Search grounding) |
| `news-funnel-gatherer`       | called by orchestrator          | Google News RSS + Finnhub company news | (returns JSON)          | No                                  |
| `news-funnel-filter`         | called by orchestrator          | (returns JSON)                         | (returns JSON)          | Yes — GPT-5-mini, **33 parallel calls** (25 per-ticker + 8 per-macro-category) |

### 5.5 Trend & narrative builders (LLM)

| Worker                       | Trigger                                | Reads                                          | Writes                       | LLM         |
|------------------------------|----------------------------------------|------------------------------------------------|------------------------------|-------------|
| `ticker-trend-long`          | HTTP `/build`, /build-all              | `ALPHA_01_Reports` history, `FUND_02_Earnings` | `TICKER_TREND_long`          | GPT-5       |
| `ticker-trend-short`         | event-triggered (news/price/staleness) | `TICKER_TREND_long`, news, price, press        | `TICKER_TREND_short`         | GPT-5       |
| `sector-trend-long`          | HTTP `/build`                          | sector-constituent filings + earnings          | `SECTOR_TREND_long`          | GPT-5       |
| `sector-trend-short`         | event-triggered                        | `SECTOR_FACTORS_daily`, constituent ticker trends, macro | `SECTOR_TREND_short` | GPT-5       |
| `macro-intelligence-builder` | HTTP `/build-macro-intelligence`       | 8w `MACRO_STATE_*`, SPY                        | `BETA_10_Daily_macro`        | GPT-5 ×3    |
| `valuation-curve-builder`    | cron `15 1 * * *` and `30 1 * * *`     | filings, earnings, price, news, prior baseline | `SIGNAL_03_ValuationCurve_*` | GPT-5       |
| `big-movers-why`             | called by job-engine                   | `PRICE_01_Daily` (today), `BETA_12_News_digest`| `MOVER_EXPLANATIONS_daily`   | GPT-5       |
| `assessment-engine`          | called by job-engine                   | factor tables + news                           | `SIGNAL_01_Assessment`       | GPT-4o-mini (explanation only — score is deterministic) |
| `operations-agent`           | event-triggered (sector trend changes) | sector-trend-short, ticker-trend-short, macro  | `OPERATION_01_Signals`       | GPT-5       |
| `consensus-validator`        | event-triggered                        | `TICKER_TREND_short` (changed tickers)         | external-grounding rows      | Gemini 2.5 Flash (Google Search grounding) |

### 5.6 Narrators (8 sub-workers under `workers/narrator/`)

The dispatcher orchestrates 5 entity-narrator workers + 1 lede-only worker. All write multi-row blocks to `NARRATIVE_01_Content`.

| Sub-worker                  | Trigger                                | LLM                          | Output rows per entity                      |
|-----------------------------|----------------------------------------|------------------------------|---------------------------------------------|
| `dispatcher`                | cron `*/15 * * * *` + `0 6 * * *` (safety) | none                       | `NARRATIVE_02_Triggers` log entries          |
| `regime`                    | called by dispatcher                   | GPT-5 (×2) + GPT-4o-mini (×1) | current_reading, identification, recommendation, lede |
| `sector`                    | called by dispatcher (per-sector)      | GPT-5 (×2) + GPT-4o-mini (×1) | same 4 rows × 8 sectors                     |
| `sector-landscape`          | called by dispatcher                   | GPT-5 (×2) + GPT-4o-mini (×1) | cross-sector comparative                    |
| `stock`                     | called by dispatcher (per-ticker)      | GPT-5 (×2) + GPT-4o-mini (×1) | same 4 rows × 25 tickers                    |
| `stock-landscape`           | called by dispatcher                   | GPT-5 (×2) + GPT-4o-mini (×1) | cross-ticker comparative                    |
| `lede`                      | called by entity narrators             | GPT-4o-mini                   | top-of-page summary                         |

**Stability gate:** every entity-narrator runs a deterministic stability check before invoking the LLM. If the source data hasn't changed enough vs. the prior `current_reading`, the narrator skips. Floor: rebuild after 7 days regardless (`narrator-dispatcher` cron `0 6 * * *`).

### 5.7 Workflow orchestration

| Worker                  | Trigger                | Purpose                                                                                  |
|-------------------------|------------------------|------------------------------------------------------------------------------------------|
| `job-engine-workflow`   | HTTP `/run` (Durable Object workflow) | Calls fetchers, factor builders, position/nav builder, signal/news workers in waves; logs to `PROC_01_Jobs` |
| `news-funnel-orchestrator` | HTTP `/run-news-funnel` | Gather → filter → summarize chain                                                     |
| `narrator-dispatcher`   | cron + HTTP            | Reads source-table change tokens; fans out to entity narrators                           |

### 5.8 Read-only / dashboard utility workers

| Worker                  | Trigger                | Purpose                                                              |
|-------------------------|------------------------|----------------------------------------------------------------------|
| `wealth-distribution`   | HTTP query             | Aggregates positions by sector for dashboard pie/alloc bar            |

### 5.9 Reporting workers (LLM, used by `report-orchestrator`)

These produce structured quarterly-report artifacts. Not yet wired into a recurring schedule.

| Worker                       | LLM (likely)        | Purpose                                                       |
|------------------------------|---------------------|---------------------------------------------------------------|
| `report-orchestrator`        | none (orchestrates) | Coordinates the QK report pipeline                            |
| `qk-structure-builder`       | GPT-5               | Splits a 10-K/10-Q into structured sections                   |
| `qk-summarizer`              | GPT-5               | Per-section summaries                                         |
| `qk-report-summarizer`       | GPT-5               | Final investor-facing narrative                               |
| `8k-summarizer`              | GPT-5 / 4o-mini     | Material 8-K event extraction                                 |
| `form4-summarizer`           | GPT-4o-mini         | Insider transaction summary                                   |
| `macro-summarizer`           | GPT-5               | Investor-summary version of macro state                       |
| `sentiment-summarizer`       | GPT-5 / 4o-mini     | Aggregated daily sentiment summary                            |
| `gen-orchestrator` + `gen-builder` | GPT-5         | Generic LLM generation utility                                |
| `beta-trend-orchestrator` + `beta-trend-builder` | GPT-5 | Experimental alternative to ticker-trend-short             |

\pagebreak

## 6. LLM prompt catalogue (verbatim)

This section reproduces every active LLM prompt. `{VARIABLE}` placeholders show where data is interpolated at runtime. **The exact text below is what the model receives.** If a number on the dashboard is wrong, and it traces back to an LLM, the prompt is the source of truth — not the explanation in the worker comments.

### 6.1 News-funnel filter — per-ticker

**Worker:** `workers/news-funnel-filter/src/worker.js` · **Model:** GPT-5-mini · **Calls per run:** 25 (one per ticker)

System:
```
You are an equity analyst selecting the most market-moving headlines for a specific US stock. Output JSON only.
```

User template:
```
TICKER: {TICKER}
TODAY: {TODAY}

HEADLINES:
{COMPACT_HEADLINE_LIST}

TASK: Pick the 1 to 4 most market-relevant headlines for {TICKER}.

RULES:
- Pick 1 minimum (even on slow days, pick the best available).
- Pick up to 4 ONLY if multiple genuinely material events happened (rare).
- Prefer today's news. Older news only if high frequency (3+).
- Focus on: earnings, product launches, M&A, regulatory, executive changes,
  lawsuits, guidance, analyst actions.
- IGNORE: generic conferences, SEO content, irrelevant geographies, opinions.
- Do not invent headlines. Use EXACT titles from the list.

MAGNITUDE — be granular, not categorical. Sign matches sentiment.
  0.05 - 0.20 = trivial (analyst tweak, minor color)
  0.25 - 0.45 = mild   (incremental positive/negative read)
  0.50 - 0.70 = moderate (clear meaningful event, e.g. small beat/miss,
                          mid-tier guidance change)
  0.75 - 0.90 = strong (earnings beat/miss with raised/cut guide, major M&A,
                        regulatory action)
  0.91 - 1.00 = exceptional (existential — accounting fraud, takeover, major recall)
  Pick a SPECIFIC value, not a bucket midpoint. Avoid defaulting to ±0.5.

OUTPUT (strict JSON, no markdown):
{ "headlines": [{ "rank":1, "title":"...", "source":"...", "date":"YYYY-MM-DD",
                  "frequency":1, "relevance":"...",
                  "sentiment":"bullish|bearish|neutral",
                  "magnitude":-1.0..1.0 }] }
```

### 6.2 News-funnel filter — per-macro-category

**Worker:** `workers/news-funnel-filter/src/worker.js` · **Model:** GPT-5-mini · **Calls per run:** 8

System:
```
You are a macro analyst selecting the most impactful headlines in a specific
category that affect US equity markets. Output JSON only.
```

User template (key differences from 6.1 — same magnitude scale):
```
CATEGORY: {CATEGORY_LABEL} ({CATEGORY_ID})
TODAY: {TODAY}
HEADLINES: {COMPACT_HEADLINE_LIST}

TASK: Pick the 1 to 2 most impactful headlines in this category that affect US
equity markets today.

RULES:
- Select the headlines that would meaningfully move indices, sectors, or stocks.
- IGNORE: local politics with no US impact, routine diplomacy, opinion pieces.
- Think: how does this affect tech, pharma, oil/energy, banks, consumer, industrial?

(magnitude scale identical to 6.1)

OUTPUT (strict JSON, no markdown): { "headlines": [...] }
```

### 6.3 News-funnel orchestrator — Gemini summary

**Worker:** `workers/news-funnel-orchestrator/src/worker.js` · **Model:** Gemini 2.5 Flash with Google Search grounding · **Calls per run:** ~40

User (no system; tool grounded to Google Search):
```
Summarize the following news in 2-3 sentences. {CONTEXT_LINE} Be factual and concise.

Headline: {SEARCH_QUERY}
Date: {ITEM_DATE}
```

`{CONTEXT_LINE}` = `Focus on market impact for {TICKER} stock.` for ticker headlines, or `Focus on how this affects US equity markets, specifically these sectors: tech, pharma, oil/energy, banks, consumer, industrial.` for macro.

### 6.4 Press summary

**Worker:** `press/summary.js` · **Model:** GPT-4o-mini · Called per press release during pipeline step 1.

User (single message, no separate system):
```
Analyze the following press release. Output JSON ONLY, no commentary.

TASK 1: Write a short factual summary (plain English, no opinions, no spin,
no analysis — just key facts).

TASK 2: Classify the EVENT TYPE (not the tone):
- "sentiment": one of "bullish", "bearish", "neutral"
- "magnitude": 0.0 to 1.0, how material this event is for shareholders

CRITICAL RULES:
- IGNORE the press release's tone. Companies always spin positively.
- Judge the underlying EVENT, not the wording.
- "Layoffs", "restructuring", "guidance cut", "product recall", "SEC investigation"
  → bearish (regardless of positive spin).
- "Earnings beat", "new major contract", "FDA approval", "flagship product launch",
  "large buyback" → bullish.
- "Minor product update", "routine leadership appointment", "conference attendance"
  → neutral with low magnitude.
- Magnitude reflects market impact: 0.1 = routine, 0.5 = notable, 0.9 = very material.

OUTPUT (strict JSON, no markdown, no extra text):
{ "summary":"...", "sentiment":"bullish|bearish|neutral", "magnitude":0.0 }

TEXT: {RAW_PRESS_TEXT}
```

### 6.5 White House summary

**Worker:** `whitehouse/index.js` · **Model:** GPT-4o-mini

```
Summarize this White House press release in plain, neutral, factual English.
No opinions. No speculation. Only key facts.

TEXT: {ARTICLE_TEXT}
```

### 6.6 Hallucination checker

**Worker:** `validation/agents/hallucination-checker.js` · **Model:** GPT-4o-mini · Called per press summary in step 9.

```
You are a fact-checking agent. Compare the SUMMARY against the SOURCE CONTENT.
Extract the key factual claims from the summary and verify each one against the
source. A hallucination is when the summary contains information NOT present in
or supported by the source content.

SOURCE CONTENT: """ {TRUNCATED_SOURCE} """
SUMMARY: """ {SUMMARY} """

Respond with ONLY valid JSON (no markdown):
{ "hasHallucinations": true/false,
  "score": 0-100,
  "verifiedFacts": [{ "fact":"...", "evidence":"..." }],
  "issues":         [{ "claim":"...", "problem":"..." }],
  "analysis": "..." }

IMPORTANT: Always populate "verifiedFacts" with the key claims you checked and
confirmed, even when there are no hallucinations. This provides proof of what
was validated.
```

### 6.7 Big-movers-why

**Worker:** `workers/big-movers-why/src/worker.js` · **Model:** GPT-5 · Called for top-5 up + top-5 down each day.

User (single message):
```
You are a senior equity analyst. Explain why {TICKER} moved {ARROW}{PCT}% today
({DATE}). Ground the explanation in the ticker-specific news and press below.

TICKER: {TICKER}
MOVE: {MOVE_PCT}%  (direction: {DIRECTION}, rank #{RANK})
DATE: {DATE}

TODAY'S HEADLINES
{HEADLINES_BLOCK}

RECENT PRESS
{PRESS_BLOCK}

TASK
Output EXACTLY this JSON — no markdown, no prose outside:
{ "thesis":"one sentence: the single reason this stock moved today",
  "headline":"the single most relevant headline title from the list above (or empty)",
  "bullets":[{"text":"short bullet","bias":"bull|bear|neutral"}] }

RULES
- thesis < 25 words, concrete
- bullets: 2-4 items, sorted by explanatory power, each < 20 words
- bias: "bull" supports the upward move, "bear" supports downward, "neutral" unclear
- Ground in the headlines/press above. If NO news explains the move, say so in
  thesis (e.g. "No material news — likely broad market / sector flows") and note
  that absence in bullets.
- DO NOT invent events.
```

### 6.8 Macro-intelligence — three sequential GPT-5 calls

**Worker:** `workers/macro-intelligence-builder/src/worker.js` · **Model:** GPT-5 (×3) · Output stored in `BETA_10_Daily_macro`.

**Call A — Trend (8-week regime):**
```
You are a senior macro analyst. Read the 8-week macro state below and output a
STRUCTURED JSON verdict on the current market regime.
{TREND_INPUT_TEXT}

TASK
Identify the regime driving markets across the last 8 weeks. CHOOSE the time
window inside those 8 weeks that best frames the current regime ... The window
you pick MUST be justified by a specific event or shift visible in the data.

Output EXACTLY this JSON:
{ "regime":"bullish|cautious_bullish|neutral|cautious_bearish|bearish",
  "window_start":"YYYY-MM-DD","window_end":"YYYY-MM-DD","window_rationale":"...",
  "drivers":[{"text":"...","bias":"bull|bear|neutral"}],
  "narrative":[{"text":"...","bias":"..."}],
  "sp500_direction":{"p_up":0.0,"p_flat":0.0,"p_down":0.0},
  "confidence":0.0 }

RULES (excerpt)
- Base every conclusion on the data above. Do not invent numbers.
- p_up + p_flat + p_down must sum to 1.0.
- drivers + narrative: 3-5 items each, sorted by impact.
- If data is sparse or contradictory, pick "neutral" and say so in window_rationale.
```

**Call B — Today (consistency check vs trend):**
```
You are the same macro analyst. Yesterday's regime verdict is below. Today's
SPY move and today's macro headlines follow. Explain today, and explicitly flag
whether today challenges the regime.

REGIME VERDICT (trend call output): {TREND_JSON}
TODAY: {TODAY}, SPY open {SPY_OPEN}, close {SPY_CLOSE}, intraday {SPY_MOVE_PCT}%
TOP MACRO HEADLINES TODAY: {TODAY_HEADLINES_TEXT}

Output EXACTLY this JSON:
{ "spy_move_pct":..., "spy_direction":"up|down|flat",
  "drivers":[{"text":"...","bias":"..."}],
  "narrative":[{"text":"...","bias":"..."}],
  "regime_tension":"none|mild|strong",
  "tension_note":"one sentence only if regime_tension != none, else \"\"",
  "confidence":0.0 }

RULES (excerpt)
- regime_tension: "none" = consistent with regime; "mild" = opposite sign < 0.75%;
  "strong" = opposite sign and >= 0.75%.
- A +1% day in a bearish regime is "strong". A +0.2% day in a bearish regime is "none".
```

**Call C — Recommendation + scenarios + sector tilt:**
```
You are the same macro analyst. The regime (trend) and today's context are below.
Now produce an actionable recommendation, a three-scenario outlook, and a sector
tilt. The upcoming economic calendar is NOT generated here ...

REGIME VERDICT: {TREND_JSON}
TODAY CONTEXT:  {TODAY_OUT_JSON}
MARKET REFERENCE: SPY {CURRENT_SPY}, horizon 4 weeks from {TODAY}

Output EXACTLY this JSON:
{ "recommendation":{
    "headline":"< 12 words","action":"add_risk|trim_risk|hold|rotate|hedge",
    "confidence":"low|medium|high",
    "bullets":[{"text":"...","bias":"..."}] },
  "scenarios":{ "horizon_weeks":4, "current_spy":{CURRENT_SPY},
    "bull":{"probability":0.0,"target_spy":0.0,"thesis":"..."},
    "base":{"probability":0.0,"target_spy":0.0,"thesis":"..."},
    "bear":{"probability":0.0,"target_spy":0.0,"thesis":"..."} },
  "sector_tilt":{ "overweight":["..."], "underweight":["..."] } }

RULES (excerpt)
- recommendation.bullets: 3-5 items, sorted by importance.
- Allowed sector names (case-sensitive): Technology, ConsDisc, Communication,
  Finance, Energy, Healthcare, Staples, Industrial.
- DO NOT generate an economic calendar. The real Finnhub-sourced calendar lives
  in MACRO_STATE_calendar and is read directly by narrator gatherers — generated
  dates from this call were prone to hallucination.
- bull > base > bear targets in a bullish regime; probabilities sum to 1.0.
```

### 6.9 Narrator family — identification (cross-entity pattern)

The five narrator entity-workers (regime, sector, sector-landscape, stock, stock-landscape) share an `identification` prompt with the same skeleton: produce 3-5 bullets with `headline`, `number`, `event`, `interpretation`, `source`. The differences are:

- **regime** (`workers/narrator/regime/identification.js`): bullets are macro drivers; sources from `MACRO_STATE_indicators`, FOMC, news.
- **sector** (`narrator/sector/identification.js`): single-sector deep-read; sources from `SECTOR_FACTORS_daily`, constituent factor + news rows; tickers must be from `input.constituents`.
- **sector-landscape** (`narrator/sector-landscape/identification.js`): comparative across sectors; bullets must reference at least 2 sectors.
- **stock** (`narrator/stock/identification.js`): per-ticker long-term diagnosis; only this ticker's data; sources from `SIGNAL_01_Assessment`, `FUND_02_Earnings`, `ALPHA_01_Reports`, `BETA_12_News_digest`, `STOCK_FACTORS_daily`.
- **stock-landscape** (`narrator/stock-landscape/identification.js`): comparative across the shortlist; bullets must reference at least 2 tickers.

All identification prompts enforce the same hard rules:
```
1. Every number cited MUST appear verbatim in the DATA block. Do not invent.
2. Bullets that fail the comparison/scope rule are dropped.
3. The INTERPRETATION field is MANDATORY. Bullets that only restate the number
   will be rejected.
4. Return `missing_factors`: concrete signals that would change your read but
   are not in the input.
```

Output (every entity narrator):
```
{ "bullets":[{ "headline":"...", "number":"...", "event":"...",
    "interpretation":"...",
    "source":{"table":"...","id":"..."} }],
  "missing_factors":["..."] }
```

### 6.10 Narrator family — recommendation (regime + sector)

**Regime** (`narrator/regime/recommendation.js`):
```
You are a senior portfolio manager. Given the regime identification below + the
economic calendar + the current book's implicit positioning, produce a crisp
stance and a handful of forward-looking signposts.

stance (one sentence): must contain
  - net exposure (%, or "long"/"neutral"/"short")
  - key tilts (sectors, factors, duration)
  - conviction score [0–1]
  - edge vs. consensus: what the market is pricing vs. what we think

signposts (3-5): trigger, threshold (numeric), dated_event (from
  economic_calendar OR future ISO date), action (specific, not "reassess").

RULES (HARD)
1. Dated events must come from the economic_calendar input or be ISO dates > {as_of}.
2. Do NOT invent numbers or events.
3. The stance MUST include an explicit edge-vs-consensus clause.
4. No hedging prose. This is a trade sheet.

{ "stance":"...", "signposts":[{ "trigger":"...","threshold":"...",
   "dated_event":"...","action":"..." }] }
```

**Sector** (`narrator/sector/recommendation.js`) follows the same structure and adds:
- The stance must name at least one ADD ticker AND one CUT ticker, both from `input.constituents`.
- Tickers outside the sector are forbidden.
- Numeric thresholds must reference factors or indicators present in the DATA block.

### 6.11 Narrator family — lede (3-4 line summary)

**Regime, sector, stock** — all use GPT-4o-mini with this skeleton:
```
You are writing the 3–4 line opening summary of a daily {SCOPE} note for a busy
professional investor.

STRICT RULES
1. Lead with the single most telling number from the note.
2. One sentence of diagnosis (pull from identification top bullet).
3. One sentence of stance (pull from recommendation).
4. End with the next dated test / trigger (pull from recommendation signposts).
5. Max 45 words. No preamble. No hedging. No adjectives.
6. Do NOT introduce any number not already in the note.

CURRENT READING: {currentReading.text}
IDENTIFICATION (top bullet): {bullet1}
RECOMMENDATION STANCE: {recommendation.stance}
NEXT SIGNPOST: {signpost1}

Output: plain text, no JSON, no quotes. Just the 3–4 line summary.
```

The sector lede adds: must name at least one ADD and one CUT ticker; stay inside the sector. The stock lede stays inside the ticker.

### 6.12 Ticker-trend long

**Worker:** `workers/ticker-trend-long/src/worker.js` · **Model:** GPT-5 · Refreshed when a new 10-Q lands.

```
You are a senior equity analyst. Build a long-term trend for {TICKER} ({SECTOR})
from its 4 latest SEC filings, 4 latest quarterly earnings, and current
fundamentals. This trend is the SLOW baseline — it changes only when new reports
or earnings land, not when daily news moves the stock.

FILINGS (chronological): {REPORTS_BLOCK}
EARNINGS HISTORY:        {EARNINGS_BLOCK}
FUNDAMENTALS:            {FUND_BLOCK}

Output EXACTLY this JSON:
{ "regime":"bullish|cautious_bullish|neutral|cautious_bearish|bearish",
  "score":-1.0..1.0,
  "thesis":"one sentence",
  "drivers":[{"text":"...","bias":"..."}],
  "narrative":[{"text":"...","bias":"..."}] }

RULES
- regime = long-horizon conviction, fundamentals-driven (NOT recent price).
- score aligns: bullish > 0.4, cautious_bullish 0.1..0.4, neutral -0.1..0.1, etc.
- drivers + narrative: 3-5 items each, sorted by importance.
- Do NOT reference daily news or current price.
- Relative valuation vs sector is legitimate context.
- Price vs 50/200 DMA may be referenced only if confirmed by fundamentals.
```

### 6.13 Valuation-curve — short and long

**Worker:** `workers/valuation-curve-builder/src/worker.js` · **Model:** GPT-5 (both calls).

**Short-curve** (price-blind, event-driven):
```
You are a buy-side analyst producing a SHORT-TERM fair value for {TICKER}.

THE STOCK PRICE IS INTENTIONALLY NOT PROVIDED. Do not estimate or infer it.
Derive fair value strictly from fundamental anchors + the recent event stack below.

ANCHORS: sector, fwd_eps, sector peer-median P/E, naive peer anchor, eps_rev_4w, breadth.
BASELINE: most recent long-term fair value (reviewed {BASELINE_DATE}): ${BASELINE_FAIR}
RECENT EVENTS (last 7d, empty sections are genuinely empty): news + press

RULES
1. short_fair_value MUST be a single $ number. No range.
2. If event stack is empty, short_fair_value MUST equal the baseline.
3. contributing_events must reference event ids from the lists above.

Output EXACTLY:
{ "short_fair_value":0.00, "baseline_fair_value":{BASELINE},
  "rationale_short":"one sentence",
  "contributing_events":[
    {"event_type":"news|press|revision","event_id":"...",
     "delta_pct":0.0,"reason":"..."}] }
```

**Long-curve** (price-aware, anchor-constrained):
```
You are a senior equity analyst producing a LONG-TERM fair value for {TICKER}.

This is a structural review. The valuation will set the baseline for all
tactical short-term valuations until the next review.

FUNDAMENTAL ANCHORS:   sector, fwd_eps, peer-median P/E, naive peer anchor,
                       rel_pe_sigma, operating margin, profit margin, eps_rev_4w
MACRO/SECTOR CONTEXT:  current regime, sector alignment, recent FOMC
STRUCTURAL EVENTS:     earnings prints, SEC filings
PREVIOUS REVIEW:       {PREVIOUS_REVIEW_BLOCK}
MARKET PRICE (for deviation narrative ONLY — DO NOT COPY): ${MARKET_PRICE}

RULES
1. long_fair_value MUST be derived from fundamentals + events. DO NOT anchor
   on market price. If your answer rubber-bands to within 2% of market price
   without explicit justification, you're doing it wrong.
2. If long_fair_value lands within 2% of market, "would_change_mind_if" MUST
   name specific triggers that would separate you from market consensus.
3. Ground every piece of rationale in a cited event id or indicator.
4. Frozen until the next structural event or 60 days pass. Write with that weight.

Output EXACTLY:
{ "long_fair_value":0.00, "rationale":"2-3 sentences",
  "key_events_cited":["..."], "deviation_narrative":"...",
  "would_change_mind_if":["...","..."] }
```

### 6.14 Operations-agent

**Worker:** `workers/operations-agent/src/worker.js` · **Model:** GPT-5 · Called per sector when sector-trend changes.

```
You are a senior portfolio manager at a hedge fund. Generate suggested
OPERATIONS for the {SECTOR} sector based on the ticker-level trends and macro
context below.

MACRO CONTEXT: regime, window, drivers
SECTOR TICKER TRENDS: {TICKER_BLOCK}
PREVIOUS OPERATIONS (for stability): {PREVIOUS_OPS_BLOCK}

Output EXACTLY this JSON:
{ "operations":[
    { "action":"buy|sell|short", "ticker":"SYM",
      "action_counter":"short|sell|buy|null",
      "counter_ticker":"SYM or SPY|null",
      "risk":"low|medium|high",
      "thesis":"one sentence",
      "bullets":[{"text":"...","bias":"..."}] } ],
  "sector_view":"one sentence",
  "changes_from_previous":"one sentence" }

RULES
- 1-4 operations per sector. Quality over quantity.
- Each can be: simple long, market-paired (X / short Y in sector), or hedged
  vs SPY.
- "sell" means close an existing long, NOT short-sell.
- Stability: if previous operations still hold, KEEP THEM.
- It is LEGITIMATE to have zero operations.
```

### 6.15 Assessment-engine — explanation only

**Worker:** `workers/assessment-engine/src/worker.js` · **Model:** GPT-4o-mini · The composite score itself is **deterministic math**; this prompt only generates the 2-sentence explanation that accompanies it.

```
Given these factor scores for {TICKER}:
{FACTOR_LINES}
Composite score: {COMPOSITE_SCORE}

Write exactly 2 sentences explaining what is driving this stock. Focus on the
strongest factors. Do not invent any numbers not listed above. Do not add
caveats or disclaimers.
```

### 6.16 Consensus-validator

**Worker:** `workers/consensus-validator/src/worker.js` · **Model:** Gemini 2.5 Flash with Google Search grounding · Called when a `TICKER_TREND_short` flips conviction.

The prompt asks the model to actively search for counter-narratives that contradict the internal trend, returning evidence + a confidence delta. Used as an anti-confirmation-bias gate.

\pagebreak

## 7. Dashboard bibliography (panel → origin)

Every visible panel on the dashboard, with its full chain. **PM = top-level book metrics, Portfolio = the 5-layer funnel, Calendar = events, News = stream, Validation = pipeline health (mostly mockup).**

### 7.1 PM tab

| Panel             | DOM id          | Endpoint           | D1 table                | Writer                 | Origin                            |
|-------------------|-----------------|--------------------|-------------------------|------------------------|-----------------------------------|
| KPI strip         | `kpiStrip`      | `/api/nav` + `/api/positions` | `NAV_01_Daily`, `POSITION_01_Daily` | nav-builder, position-builder | `TRADE_01_Ledger` (manual + seed) + Polygon prices |
| NAV curve         | `pmNavSvg`      | `/api/nav`, `/api/ticker-history/SPY` | `NAV_01_Daily`, `PRICE_01_Daily` | same | same |
| Attribution donut | `attributionDonut` | `/api/attribution` | (computed live) | portfolio-ingestor `/query/attribution` | NAV vs SPY active-return × 40/30/20/10 proxy split |
| Drawdown          | `pmDrawdown`    | (no endpoint — derived from `DATA.navCurve`) | NAV_01_Daily | same | same |
| Positions table   | `pmTable`       | `/api/positions`   | POSITION_01_Daily       | position-builder       | trade ledger + prices             |

**Pill labels** ("1d P&L", "Nd P&L") are derived from the actual gap between the two latest `NAV_01_Daily` rows. Sparse pipeline runs make this 7-day sometimes. The label tells you which.

### 7.2 Portfolio tab

**Layer 1 — Regime card**

| Field                                  | Source                                                                |
|----------------------------------------|-----------------------------------------------------------------------|
| Verdict line + lede                    | `BETA_10_Daily_macro` (Call A trend.regime, recommendation.headline) — overlaid by narrator regime lede when fresh |
| 4 signal chips (DGS10, DGS2, CPI_CORE, FEDFUNDS) | `/api/indicator-history` ← `MACRO_STATE_indicators` ← macro-state-fetcher (FRED/BLS daily) |
| Net-exposure gauge                     | `/api/nav` → `(gross_long − gross_short) / net_value × 100`            |
| Style tilts (Quality, Low vol, Growth, Value, Momentum) | computed in dashboard `bootstrapStyleTilts()` from `/api/stock-factors` × `/api/positions` × `/api/returns-vol` |

**Layer 2 — Sector**

| Field                       | Source                                                    |
|-----------------------------|-----------------------------------------------------------|
| Sector table (8 rows)       | `/api/sector-factors` ← `SECTOR_FACTORS_daily` ← sector-factor-builder |
| RRG chart                   | same — uses `rs_ratio`, `rs_momentum`                      |
| Allocation bar              | derived from `DATA.sectors.weight` (rebalance map)         |
| Sector lede overlay         | narrator/sector lede via `/api/narrative?entity=sector`    |

**Layer 3 — Stocks**

| Field                       | Source                                                    |
|-----------------------------|-----------------------------------------------------------|
| Stock-group rows (per sector) | `/api/stock-factors` ← `STOCK_FACTORS_daily` ← stock-factor-builder |
| Scatter (EPS-Rev × Rel P/E σ) | same                                                    |
| Stock-landscape lede overlay| narrator/stock-landscape lede                             |

**Layer 4 — Weights & decision trail**

| Field                       | Source                                                    |
|-----------------------------|-----------------------------------------------------------|
| Weight chart (current → target) | `/api/positions` + `/api/portfolio-targets` (currently flat 4% — placeholder) |
| Decision trail              | composed in `bootstrapDecisionTrail()` from `/api/daily-macro` (regime), `/api/sector-factors` (sector stance), `/api/stock-factors` (factor highlights) — picks the ticker with biggest weight gap |

**Layer 5 — Feedback**

| Field                       | Source                                                    |
|-----------------------------|-----------------------------------------------------------|
| Waterfall (regime / sector / stock / sizing) | `/api/attribution` — proxy 40/30/20/10 split of NAV-vs-SPY active return (in basis points) |
| Calibration curve           | `/api/calibration` — actuals null until trades close      |
| Closed-trades list          | `/api/trades/closed` — empty placeholder until ledger has sells |

**Regime detail view** (click "Open full regime analysis" on Layer 1)

| Field                       | Source                                                    |
|-----------------------------|-----------------------------------------------------------|
| 12-indicator board          | `/api/indicator-history` ← `MACRO_STATE_indicators` ← macro-state-fetcher |
| Latest releases & events    | `DATA.calendarEvents` (built in `bootstrapCalendar`)      |

### 7.3 Calendar tab

| Field            | Source                                                                   |
|------------------|--------------------------------------------------------------------------|
| 6-week grid      | union of `/api/earnings-calendar` (Finnhub via portfolio-ingestor), `/api/fomc-calendar` (hardcoded list), `/api/calendar` (`MACRO_STATE_calendar` via economic-calendar-fetcher) |

### 7.4 News tab

| Field            | Source                                                                   |
|------------------|--------------------------------------------------------------------------|
| News stream      | `/api/news-digest/{date}` ← `BETA_12_News_digest` ← news-funnel-orchestrator (33 GPT-5-mini filters + Gemini summaries) |
| Top movers       | `/api/movers` ← `MOVER_EXPLANATIONS_daily` ← big-movers-why (GPT-5)      |
| Clusters         | (no endpoint — frontend-side)                                             |

### 7.5 Validation tab

| Field            | Source                                                                   |
|------------------|--------------------------------------------------------------------------|
| Feed status      | hardcoded mockup (`DATA.feeds`)                                          |
| Anomalies log    | hardcoded mockup (`DATA.anomalies`)                                      |
| Monthly check    | hardcoded mockup (`DATA.monthlyCheck`)                                   |
| Dispatcher status| `/api/triggers` ← narrator-dispatcher `/status`                          |

The Validation tab is **explicitly accepted as mockup until the corresponding detector workers exist** (see § 8).

\pagebreak

## 8. Known gaps, dead code, accepted mockups

This is the punch list. **A field on the dashboard that traces here is not real data.** Track changes here as the system matures.

### 8.1 Conceptual gaps (data does not exist anywhere)

| Item                              | What's missing                                                  |
|-----------------------------------|-----------------------------------------------------------------|
| Validation tab — Anomalies log    | No anomaly detector worker. UI shows hardcoded examples.        |
| Validation tab — Monthly check    | No monthly-cadence orchestrator. UI shows hardcoded checklist.  |
| Validation tab — Feed status      | Could be wired to `PIPELINE_VALIDATION` table, not done yet.    |
| `SECTOR_FACTORS_daily.flow_5d`    | ETF inflow source doesn't exist. Column always NULL.            |
| Real `portfolio-targets`          | Worker `wealth-distribution` returns flat 4% per ticker placeholder. |
| TSLA press releases               | TSLA newsroom anti-bot. Press never lands. SEC + fundamentals OK. |

### 8.2 Latent / event-driven holes (will fill over time)

| Item                              | When it fills                                                   |
|-----------------------------------|-----------------------------------------------------------------|
| `piotroski_f` — 22/25 null today  | Smart-fetch back-fills as 10-Qs land + AV indexes them; ~5 nights to converge |
| `eps_rev_4w` / `rev_breadth_4w` zeroes | Fill when analyst-recs data refreshes for those tickers     |
| `short_pct_float` — all 25 null   | Yahoo blocks Cloudflare worker egress; permanent until alt source |
| Calibration actuals — all null    | Populates as trades close; needs realized P&L                   |
| `DATA.releases` — hardcoded       | Used in indicator-detail "Most recent release" section; awaiting wired source |

### 8.3 Orphans / dead code

| Item                              | Status                                                          |
|-----------------------------------|-----------------------------------------------------------------|
| `news/index.js`                   | Local script, never called by pipeline. Real news work is server-side. |
| `ALPHA_04_Trends` table           | `/ingest/trends` writes; nothing reads. Decommissioned chain leftover. |
| `dashboard/archive/`              | Old "research-brief" UI; superseded by current funnel.          |
| `workers/probability-curve-builder/` | Wired but not yet invoked. Future for probability curves.   |
| `sentiment/AAII.mhtml`            | Deleted — live scrape is primary, MHTML guard refuses files >14d old. |

### 8.4 Robustness items still on the watchlist

| Item                                                          | Severity |
|---------------------------------------------------------------|----------|
| `macro-state-fetcher` lacks per-series try/catch              | medium — one bad FRED/BLS series fails the whole nightly run |
| `news-funnel-filter` magnitude calibration                    | low — recent prompt fix in place; verify continuous output    |
| `fomc-statement-fetcher` and `economic-calendar-fetcher` both fire 00:00 UTC | low — different tables, Cloudflare serializes |
| Layer 5 waterfall split is a fixed proxy                      | medium — caption now flags it; real per-position attribution needs work |

\pagebreak

## 9. Glossary & index

### Terms

| Term                         | Meaning                                                          |
|------------------------------|------------------------------------------------------------------|
| **Piotroski F-score**        | 0-9 quality score (Joseph Piotroski, 2000). Sum of 9 binary fundamental signals: ROA>0, CFO>0, ΔROA>0, CFO>NI, Δleverage<0, Δcurrent ratio>0, no share issuance, Δgross margin>0, Δasset turnover>0. 8-9 = strong, 0-2 = weak. |
| **RRG (Relative Rotation Graph)** | Plot of 8 sector ETFs in (RS-ratio × RS-momentum) space, both centered at 100. Quadrants: Leading (top-right, both >100), Improving (top-left, ratio<100, momentum>100), Lagging (bottom-right), Weakening (bottom-left). |
| **rel_pe_sigma**             | Z-score of a ticker's forward P/E vs. its sector peers' median P/E, in σ units. Negative = cheap, positive = expensive. |
| **eps_rev_4w**               | 4-week change in the bullish-recommendation ratio (proxy for analyst EPS revisions). Live values typically ±0.02 (=±2pp). |
| **mom_12_1**                 | Jegadeesh-Titman 12-1 momentum: return from t-252 to t-21 (skip last month to avoid reversal noise). |
| **SUE**                      | Standardized Unexpected Earnings: most recent earnings surprise / σ of last 8 surprises. |
| **stance**                   | Sector OW / EW / UW classification. Computed deterministically from `stance_score`, which is a weighted average of regime_fit, earn_momentum, valuation_sigma, rel_strength_13w. |
| **regime**                   | Macro state classifier: bullish / cautious_bullish / neutral / cautious_bearish / bearish. Output of `macro-intelligence-builder` (GPT-5). |
| **identification / recommendation / lede** | Three-stage narrator output. Identification = bullets describing what's happening. Recommendation = stance + dated signposts. Lede = 3-4 line summary. |
| **trend (long vs short)**    | Long = fundamentals-only, refreshed at filings. Short = tactical, event-driven, 7-day floor. |

### Files / endpoints index

```
src/pipeline.js                          10-step Node orchestrator
src/steps/*.js                           one per pipeline step
press/, edgar/, macro/, sentiment/       scrapers
whitehouse/                              policy + FOMC
workers/portfolio-ingestor/              D1 ingest + query proxy
workers/<family>-builder/                deterministic factor/narrative writers
workers/narrator/<entity>/               LLM narrators (regime, sector, stock, ...)
workers/news-funnel-*/                   3-stage news pipeline
workers/macro-intelligence-builder/      3-call macro regime
workers/valuation-curve-builder/         dual-mode fair-value
workers/big-movers-why/                  daily mover explanations
workers/operations-agent/                trade suggestions per sector
workers/assessment-engine/               composite score + 2-sentence explainer
workers/event-attribution-engine/        macro/sector/company classification
workers/<position|nav|wealth-distribution> portfolio composition
dashboard/server.js                      Express proxy → portfolio-ingestor
dashboard/app.js                         frontend renderers + bootstrappers
dashboard/index.html                     5 tabs + entity detail view
docs/STRUCTURE.md                        architecture + dead-code log
```

### Things this document does NOT cover

- Wrangler / Cloudflare deploy details (see `wrangler.jsonc` per worker).
- Per-line code semantics (the report is functional, not implementation).
- The Linux server's systemd configuration (see `/etc/systemd/system/hedge-pipeline.*` on hedge-server).
- Cloudflare Tunnel routing (see `https://depot-speaks-newsletters-submit.trycloudflare.com` — the public URL — and `cloudflared` running on the Linux server).

---

**End of report.** Generated against repo at commit `12bf9ba`. Re-generate this document when the worker topology changes (new workers, new prompts, new tables) — it is the load-bearing source of truth for trust audits.
